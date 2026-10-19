import { env } from "cloudflare:workers";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ApiError } from "@/lib/errors";

const SESSION_COOKIE = "voicebook_session";
const SESSION_SECONDS = 7 * 24 * 60 * 60;
// Existing deployment compatibility, below OWASP's recommendation; see SECURITY.md.
// Do not raise without runtime benchmarking and a versioned rehash migration.
const PBKDF2_ITERATIONS = 100_000;
// Same KDF work for unknown accounts. The result is never accepted as a login.
const DUMMY_PASSWORD_HASH = `pbkdf2$${PBKDF2_ITERATIONS}$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;

export type AppUser = {
  userId: string;
  username: string;
  displayName: string;
  role: "admin" | "user";
};

function db() {
  if (!env.DB) throw new Error("User database is unavailable");
  return env.DB;
}

function bytesToBase64Url(bytes: Uint8Array) {
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const decoded = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToBase64Url(new Uint8Array(digest));
}

export async function enforceLoginRateLimit(request: Request, usernameInput: string) {
  const username = normalizeUsername(usernameInput);
  const address = clientAddress(request);
  const buckets = [
    { scope: `login:pair:${username}:${address}`, limit: 10 },
    { scope: `login:account:${username}`, limit: 10 },
    { scope: `login:ip:${address}`, limit: 50 },
  ];
  const results = await Promise.all(buckets.map(async bucket => {
    const key = await sha256(bucket.scope);
    return { key, attempts: await incrementAttempt(key), limit: bucket.limit };
  }));
  if (results.some(result => result.attempts > result.limit)) {
    throw new ApiError("Too many login attempts. Try again in 15 minutes", 429);
  }
  // Successful login clears this pair/account only, never the shared IP bucket.
  return results.slice(0, 2).map(result => result.key);
}

export async function enforceRegistrationRateLimit(request: Request) {
  // One bucket per address, not per username: rotating names must not bypass it.
  return enforceAuthRateLimit(request, "registration", "Too many registration attempts. Try again in 15 minutes");
}

async function enforceAuthRateLimit(request: Request, scope: string, message: string) {
  const attemptKey = await sha256(`${scope}:${clientAddress(request)}`);
  if (await incrementAttempt(attemptKey) > 10) throw new ApiError(message, 429);
  return attemptKey;
}

function clientAddress(request: Request) {
  // Cloudflare supplies this trusted header. Do not trust client X-Forwarded-For.
  return request.headers.get("cf-connecting-ip") || "local";
}

async function incrementAttempt(attemptKey: string) {
  const now = new Date();
  const cutoff = new Date(now.getTime() - 15 * 60 * 1000).toISOString();
  const row = await db().prepare(`
    INSERT INTO auth_login_attempts (attempt_key, window_started_at, attempts)
    VALUES (?, ?, 1)
    ON CONFLICT(attempt_key) DO UPDATE SET
      attempts = CASE WHEN window_started_at <= ? THEN 1 ELSE attempts + 1 END,
      window_started_at = CASE WHEN window_started_at <= ? THEN excluded.window_started_at ELSE window_started_at END
    RETURNING attempts
  `).bind(attemptKey, now.toISOString(), cutoff, cutoff).first<{ attempts: number }>();
  if (!row) throw new Error("Login rate limit unavailable");
  return row.attempts;
}

export async function clearLoginRateLimit(attemptKeys: string[]) {
  await db().batch(attemptKeys.map(key => db().prepare("DELETE FROM auth_login_attempts WHERE attempt_key = ?").bind(key)));
}

export async function verifyCurrentPassword(userId: string, password: string) {
  const row = await db().prepare("SELECT password_hash AS hash FROM app_users WHERE user_id=? AND active=1").bind(userId).first<{hash: string}>();
  return Boolean(row?.hash && await verifyPassword(password, row.hash));
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITERATIONS }, key, 256);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${bytesToBase64Url(salt)}$${bytesToBase64Url(new Uint8Array(bits))}`;
}

async function verifyPassword(password: string, stored: string) {
  const [algorithm, iterationsText, saltText, expected] = stored.split("$");
  if (algorithm !== "pbkdf2" || !iterationsText || !saltText || !expected) return false;
  const iterations = Number(iterationsText);
  if (!Number.isInteger(iterations) || iterations < 10_000 || iterations > 500_000) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: base64UrlToBytes(saltText), iterations }, key, 256);
  const actual = new Uint8Array(bits);
  const expectedBytes = base64UrlToBytes(expected);
  if (actual.length !== expectedBytes.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) difference |= actual[index] ^ expectedBytes[index];
  return difference === 0;
}

function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

export async function ensureBootstrapAdmin() {
  const username = normalizeUsername(env.ADMIN_USERNAME || process.env.ADMIN_USERNAME || "admin");
  const password = env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD;
  if (!password) throw new Error("ADMIN_PASSWORD is not configured");
  const existing = await db().prepare("SELECT user_id FROM app_users WHERE username = ?").bind(username).first();
  if (existing) return;
  const now = new Date().toISOString();
  const userId = crypto.randomUUID();
  await db().prepare(`
    INSERT INTO app_users (
      user_id, email, display_name, created_at, last_seen_at,
      username, password_hash, role, active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'admin', 1)
    ON CONFLICT(username) DO NOTHING
  `).bind(userId, username, "Administrator", now, now, username, await hashPassword(password)).run();
}

export async function authenticate(usernameInput: string, password: string) {
  await ensureBootstrapAdmin();
  const username = normalizeUsername(usernameInput);
  const row = await db().prepare(`
    SELECT user_id AS userId, username, display_name AS displayName,
      password_hash AS passwordHash, role, active
    FROM app_users WHERE username = ?
  `).bind(username).first<AppUser & { passwordHash: string; active: number }>();
  const validPassword = await verifyPassword(password, row?.passwordHash || DUMMY_PASSWORD_HASH);
  if (!row || !row.active || !row.passwordHash || !validPassword) {
    throw new ApiError("Invalid username or password", 401);
  }
  const token = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash = await sha256(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_SECONDS * 1000);
  const results = await db().batch([
    db().prepare("DELETE FROM auth_sessions WHERE expires_at <= ?").bind(now.toISOString()),
    db().prepare(`INSERT INTO auth_sessions (token_hash, user_id, created_at, expires_at)
      SELECT ?, user_id, ?, ? FROM app_users WHERE user_id = ? AND active = 1 AND password_hash = ?`)
      .bind(tokenHash, now.toISOString(), expiresAt.toISOString(), row.userId, row.passwordHash),
    db().prepare("UPDATE app_users SET last_seen_at = ? WHERE user_id = ? AND EXISTS(SELECT 1 FROM auth_sessions WHERE token_hash = ?)")
      .bind(now.toISOString(), row.userId, tokenHash),
  ]);
  if (results[1].meta.changes !== 1) throw new ApiError("Invalid username or password", 401);
  return { token, user: { userId: row.userId, username: row.username, displayName: row.displayName, role: row.role } as AppUser };
}

export async function setSessionCookie(token: string, secure: boolean) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: SESSION_SECONDS });
}

export async function clearSession(secure: boolean) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) await db().prepare("DELETE FROM auth_sessions WHERE token_hash = ?").bind(await sha256(token)).run();
  cookieStore.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 0 });
}

export async function getAuthenticatedUser(): Promise<AppUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = await db().prepare(`
    SELECT users.user_id AS userId, users.username, users.display_name AS displayName, users.role
    FROM auth_sessions sessions
    JOIN app_users users ON users.user_id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ? AND users.active = 1
  `).bind(await sha256(token), new Date().toISOString()).first<AppUser>();
  return row || null;
}

export async function requireAuthenticatedUser() {
  const user = await getAuthenticatedUser();
  if (!user) throw new ApiError("Please log in to use Voicebook", 401);
  return user;
}

export async function requirePageUser(returnTo: string) {
  const user = await getAuthenticatedUser();
  if (user) return user;
  redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
}

export function validateAccountInput(input: { username: string; password: string; displayName?: string }) {
  const username = normalizeUsername(input.username);
  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username)) throw new ApiError("Username must be 3-32 letters, numbers, dots, dashes, or underscores", 400);
  if (input.password.length < 10 || input.password.length > 128) throw new ApiError("Password must be 10-128 characters", 400);
  if ((input.displayName?.trim().length || 0) > 80) throw new ApiError("Display name must be at most 80 characters", 400);
  return username;
}

export async function createUserAccount(input: { username: string; password: string; displayName?: string }) {
  const username = validateAccountInput(input);
  const now = new Date().toISOString();
  const userId = crypto.randomUUID();
  try {
    await db().prepare(`
      INSERT INTO app_users (
        user_id, email, display_name, created_at, last_seen_at,
        username, password_hash, role, active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'user', 1)
    `).bind(userId, username, input.displayName?.trim() || username, now, now, username, await hashPassword(input.password)).run();
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE")) throw new ApiError("That username already exists", 409);
    throw error;
  }
  return userId;
}
