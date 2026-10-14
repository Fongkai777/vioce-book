import { env } from "cloudflare:workers";
import {
  apiErrorResponse, DEFAULT_QUESTION_LIMIT, DEFAULT_VOICE_SECONDS_LIMIT,
  requireAdminUser, singaporeDate,
} from "@/lib/quota";

function db() {
  if (!env.DB) throw new Error("Usage database is unavailable");
  return env.DB;
}

export async function GET() {
  try {
    await requireAdminUser();
    const date = singaporeDate();
    const result = await db().prepare(`
      SELECT
        users.user_id AS userId,
        users.email,
        users.display_name AS displayName,
        users.last_seen_at AS lastSeenAt,
        COALESCE(usage.question_count, 0) AS questionCount,
        COALESCE(usage.voice_seconds, 0) AS voiceSeconds,
        COALESCE(quota.question_limit, ?) AS questionLimit,
        COALESCE(quota.voice_seconds_limit, ?) AS voiceSecondsLimit
      FROM app_users users
      LEFT JOIN daily_usage usage
        ON usage.user_id = users.user_id AND usage.usage_date = ?
      LEFT JOIN quota_overrides quota ON quota.user_id = users.user_id
      ORDER BY users.last_seen_at DESC
    `).bind(DEFAULT_QUESTION_LIMIT, DEFAULT_VOICE_SECONDS_LIMIT, date).all();
    return Response.json({ date, users: result.results });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await requireAdminUser();
    const body = (await request.json()) as { userId?: unknown; questionLimit?: unknown; voiceMinutesLimit?: unknown };
    const userId = String(body.userId || "").trim();
    const questionLimit = Number(body.questionLimit);
    const voiceMinutesLimit = Number(body.voiceMinutesLimit);
    if (!userId || !Number.isInteger(questionLimit) || questionLimit < 0 || questionLimit > 500) {
      return Response.json({ error: "Question limit must be an integer from 0 to 500" }, { status: 400 });
    }
    if (!Number.isFinite(voiceMinutesLimit) || voiceMinutesLimit < 0 || voiceMinutesLimit > 600) {
      return Response.json({ error: "Voice limit must be between 0 and 600 minutes" }, { status: 400 });
    }
    const voiceSecondsLimit = Math.round(voiceMinutesLimit * 60);
    await db().prepare(`
      INSERT INTO quota_overrides (user_id, question_limit, voice_seconds_limit, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        question_limit = excluded.question_limit,
        voice_seconds_limit = excluded.voice_seconds_limit,
        updated_at = excluded.updated_at
    `).bind(userId, questionLimit, voiceSecondsLimit, new Date().toISOString()).run();
    return Response.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
