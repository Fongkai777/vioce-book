import { env } from "cloudflare:workers";
import { getChatGPTUser, type ChatGPTUser } from "@/app/chatgpt-auth";

export const DEFAULT_QUESTION_LIMIT = 20;
export const DEFAULT_VOICE_SECONDS_LIMIT = 10 * 60;
const DAILY_EMBEDDING_CHARACTER_LIMIT = 750_000;
const DAILY_SPEECH_CHARACTER_LIMIT = 50_000;

type Meter = "question" | "voice" | "embedding" | "speech";

export type QuotaSnapshot = {
  date: string;
  questions: { used: number; limit: number; remaining: number };
  voice: { usedSeconds: number; limitSeconds: number; remainingSeconds: number };
  isAdmin: boolean;
  user: { userId: string; email: string; displayName: string };
};

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

function database() {
  if (!env.DB) throw new Error("Usage database is unavailable");
  return env.DB;
}

export function singaporeDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Singapore", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function isAdminUser(user: Pick<ChatGPTUser, "email">) {
  const admins = (env.ADMIN_EMAILS || process.env.ADMIN_EMAILS || "")
    .split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
  return admins.includes(user.email.toLowerCase());
}

export async function requireApiUser() {
  const user = await getChatGPTUser();
  if (!user) throw new ApiError("Please sign in to use Voicebook", 401);
  await upsertUser(user);
  return user;
}

export async function requireAdminUser() {
  const user = await requireApiUser();
  if (!isAdminUser(user)) throw new ApiError("Administrator access is required", 403);
  return user;
}

async function upsertUser(user: ChatGPTUser) {
  const now = new Date().toISOString();
  await database().prepare(`
    INSERT INTO app_users (user_id, email, display_name, created_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      email = excluded.email,
      display_name = excluded.display_name,
      last_seen_at = excluded.last_seen_at
  `).bind(user.userId, user.email, user.displayName, now, now).run();
}

async function ensureDailyRow(userId: string, date: string) {
  const now = new Date().toISOString();
  await database().prepare(`
    INSERT INTO daily_usage (
      user_id, usage_date, question_count, voice_seconds,
      embedding_characters, speech_characters, updated_at
    ) VALUES (?, ?, 0, 0, 0, 0, ?)
    ON CONFLICT(user_id, usage_date) DO NOTHING
  `).bind(userId, date, now).run();
}

export async function getQuotaSnapshot(user: ChatGPTUser): Promise<QuotaSnapshot> {
  const date = singaporeDate();
  await ensureDailyRow(user.userId, date);
  const row = await database().prepare(`
    SELECT
      u.question_count AS questionCount,
      u.voice_seconds AS voiceSeconds,
      COALESCE(q.question_limit, ?) AS questionLimit,
      COALESCE(q.voice_seconds_limit, ?) AS voiceSecondsLimit
    FROM daily_usage u
    LEFT JOIN quota_overrides q ON q.user_id = u.user_id
    WHERE u.user_id = ? AND u.usage_date = ?
  `).bind(DEFAULT_QUESTION_LIMIT, DEFAULT_VOICE_SECONDS_LIMIT, user.userId, date)
    .first<{ questionCount: number; voiceSeconds: number; questionLimit: number; voiceSecondsLimit: number }>();
  if (!row) throw new Error("Could not load daily usage");
  return {
    date,
    questions: {
      used: row.questionCount,
      limit: row.questionLimit,
      remaining: Math.max(0, row.questionLimit - row.questionCount),
    },
    voice: {
      usedSeconds: row.voiceSeconds,
      limitSeconds: row.voiceSecondsLimit,
      remainingSeconds: Math.max(0, row.voiceSecondsLimit - row.voiceSeconds),
    },
    isAdmin: isAdminUser(user),
    user: { userId: user.userId, email: user.email, displayName: user.displayName },
  };
}

export async function consumeQuota(user: ChatGPTUser, meter: Meter, rawAmount: number) {
  const amount = Math.max(1, Math.ceil(rawAmount));
  const date = singaporeDate();
  await ensureDailyRow(user.userId, date);
  const now = new Date().toISOString();
  const specs = {
    question: {
      column: "question_count", limit: `COALESCE((SELECT question_limit FROM quota_overrides WHERE user_id = ?), ${DEFAULT_QUESTION_LIMIT})`,
      message: "Your daily question limit has been reached",
    },
    voice: {
      column: "voice_seconds", limit: `COALESCE((SELECT voice_seconds_limit FROM quota_overrides WHERE user_id = ?), ${DEFAULT_VOICE_SECONDS_LIMIT})`,
      message: "Your daily voice allowance has been reached",
    },
    embedding: {
      column: "embedding_characters", limit: String(DAILY_EMBEDDING_CHARACTER_LIMIT),
      message: "Your daily book indexing allowance has been reached",
    },
    speech: {
      column: "speech_characters", limit: String(DAILY_SPEECH_CHARACTER_LIMIT),
      message: "Your daily speech playback allowance has been reached",
    },
  } satisfies Record<Meter, { column: string; limit: string; message: string }>;
  const spec = specs[meter];
  const usesOverride = meter === "question" || meter === "voice";
  const statement = database().prepare(`
    UPDATE daily_usage
    SET ${spec.column} = ${spec.column} + ?, updated_at = ?
    WHERE user_id = ? AND usage_date = ?
      AND ${spec.column} + ? <= ${spec.limit}
  `);
  const args = usesOverride
    ? [amount, now, user.userId, date, amount, user.userId]
    : [amount, now, user.userId, date, amount];
  const result = await statement.bind(...args).run();
  if (!result.meta.changes) throw new ApiError(spec.message, 429);
}

export function apiErrorResponse(error: unknown) {
  const status = error instanceof ApiError ? error.status : 500;
  const message = error instanceof Error ? error.message : "Unexpected server error";
  return Response.json({ error: message }, { status });
}
