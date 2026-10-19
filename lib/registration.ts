import { env } from "cloudflare:workers";
import { hashPassword, validateAccountInput } from "./auth";
import { ApiError } from "./errors";
import { singaporeDate } from "./quota";

export const DAILY_SELF_REGISTRATION_LIMIT = 2;
function database() {
  if (!env.DB) throw new Error("User database is unavailable");
  return env.DB;
}

export async function registrationStatus(now = new Date()) {
  const date = singaporeDate(now);
  const row = await database().prepare("SELECT registrations FROM auth_registration_days WHERE date=?")
    .bind(date).first<{ registrations: number }>();
  return { date, limit: DAILY_SELF_REGISTRATION_LIMIT,
    remaining: Math.max(0, DAILY_SELF_REGISTRATION_LIMIT - (row?.registrations || 0)), timeZone: "Asia/Singapore" };
}

export async function registerUserAccount(input: { username: string; password: string; displayName?: string }) {
  const username = validateAccountInput(input);
  const reservedAdmin = (env.ADMIN_USERNAME || process.env.ADMIN_USERNAME || "admin").trim().toLowerCase();
  if (username === reservedAdmin) throw new ApiError("That username is unavailable", 409);
  const passwordHash = await hashPassword(input.password);
  // Date is captured after hashing, immediately before admission. No browser date.
  const now = new Date(), date = singaporeDate(now), userId = crypto.randomUUID();
  try {
    // D1 batch is transactional: a duplicate username or failed insertion rolls
    // back the slot too. The SQL gate, not a preceding read, controls admission.
    const result = await database().batch([
      database().prepare("INSERT INTO auth_registration_days(date,registrations) VALUES(?,0) ON CONFLICT(date) DO NOTHING").bind(date),
      database().prepare("UPDATE auth_registration_days SET registrations=registrations+1 WHERE date=? AND registrations<?")
        .bind(date, DAILY_SELF_REGISTRATION_LIMIT),
      database().prepare(`INSERT INTO app_users(user_id,email,display_name,created_at,last_seen_at,username,password_hash,role,active)
        SELECT ?,?,?,?,?,?,?,'user',1 WHERE changes()=1`)
        .bind(userId, username, input.displayName?.trim() || username, now.toISOString(), now.toISOString(), username, passwordHash),
    ]);
    if (result[2].meta.changes !== 1) throw new ApiError("Today's 2 self-registration places have been taken. Try after midnight Singapore time, or ask the administrator for an account.", 429);
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE")) throw new ApiError("That username is unavailable. Choose another, or sign in if it is yours.", 409);
    throw error;
  }
  return userId;
}
