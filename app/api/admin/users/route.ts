import { assertSameOrigin } from "@/lib/request-security";
import { env } from "cloudflare:workers";
import { createUserAccount, clearLoginRateLimit, enforceReauthenticationRateLimit, hashPassword, verifyCurrentPassword } from "@/lib/auth";
import { ApiError } from "@/lib/errors";
import { monitoredRoute } from "@/lib/operations";
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
        users.username,
        users.role,
        users.active,
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
      WHERE users.username IS NOT NULL
      ORDER BY users.last_seen_at DESC
    `).bind(DEFAULT_QUESTION_LIMIT, DEFAULT_VOICE_SECONDS_LIMIT, date).all();
    return Response.json({ date, users: result.results }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export const PUT = monitoredRoute("admin/users/security", async (request: Request) => {
  const admin = await requireAdminUser();
  const body = await request.json() as { userId?: unknown; action?: unknown; active?: unknown; newPassword?: unknown; adminPassword?: unknown };
  if (!body || typeof body.userId !== "string" || !body.userId || body.userId.length > 100 ||
      typeof body.adminPassword !== "string" || !body.adminPassword || body.adminPassword.length > 128) {
    throw new ApiError("A user and your administrator password are required", 400);
  }
  if (body.action !== "set-active" && body.action !== "reset-password") throw new ApiError("Unknown account action", 400);
  if (body.action === "set-active" && typeof body.active !== "boolean") throw new ApiError("An account status is required", 400);
  if (body.action === "reset-password" && (typeof body.newPassword !== "string" || body.newPassword.length < 10 || body.newPassword.length > 128)) {
    throw new ApiError("Password must be 10-128 characters", 400);
  }
  const attemptKeys = await enforceReauthenticationRateLimit(admin.userId);
  if (!await verifyCurrentPassword(admin.userId, body.adminPassword)) throw new ApiError("Administrator password is incorrect", 401);
  await clearLoginRateLimit(attemptKeys);
  const target = await db().prepare("SELECT role FROM app_users WHERE user_id=?").bind(body.userId).first<{role: string}>();
  if (!target) throw new ApiError("User not found", 404);
  if (body.userId === admin.userId || target.role !== "user") throw new ApiError("Only regular user accounts can be managed here", 403);
  const update = body.action === "set-active"
    ? db().prepare("UPDATE app_users SET active=? WHERE user_id=? AND role='user'").bind(body.active ? 1 : 0, body.userId)
    : db().prepare("UPDATE app_users SET password_hash=? WHERE user_id=? AND role='user'").bind(await hashPassword(body.newPassword as string), body.userId);
  await db().batch([
    update,
    db().prepare("DELETE FROM auth_sessions WHERE user_id=?").bind(body.userId),
    db().prepare("INSERT INTO operations_audit(id,actor,action,created_at) VALUES(?,?,?,?)")
      .bind(crypto.randomUUID(), admin.userId, `${body.action === "reset-password" ? "Password reset" : body.active ? "Account enabled" : "Account disabled"}: ${body.userId}`, new Date().toISOString()),
  ]);
  return Response.json({ ok: true });
}, 4096);

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await requireAdminUser();
    const body = (await request.json()) as { username?: unknown; password?: unknown; displayName?: unknown };
    const userId = await createUserAccount({
      username: String(body.username || ""),
      password: String(body.password || ""),
      displayName: String(body.displayName || ""),
    });
    return Response.json({ ok: true, userId }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
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
