import { requireAdminUser } from "@/lib/quota";
import { assertSameOrigin } from "@/lib/request-security";
import { boundedRequest } from "@/lib/bounded-request";
import { ApiError, apiErrorResponse } from "@/lib/errors";
import { operationsSnapshot, operationsSettings, operationsDatabase, clearLegacyEstimate } from "@/lib/operations";

export async function GET() {
  try { await requireAdminUser(); return Response.json(await operationsSnapshot(), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return apiErrorResponse(error); }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request); const user = await requireAdminUser();
    const body = await (await boundedRequest(request, 4096)).json() as {action?: unknown; date?: unknown; expectedMicros?: unknown};
    if (!body || body.action !== "clear-legacy-estimate" || typeof body.date !== "string" || typeof body.expectedMicros !== "number") {
      throw new ApiError("Invalid legacy estimate adjustment.", 400);
    }
    await clearLegacyEstimate(user.userId, body.date, body.expectedMicros);
    return Response.json(await operationsSnapshot(), {headers:{"Cache-Control":"no-store"}});
  } catch (error) { return apiErrorResponse(error); }
}
export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request); const user = await requireAdminUser();
    const body = await (await boundedRequest(request, 4096)).json() as { enabled?: unknown; dailyBudgetUsd?: unknown; maxConcurrent?: unknown };
    if (!body || typeof body.enabled !== "boolean" || typeof body.dailyBudgetUsd !== "number" ||
      !Number.isFinite(body.dailyBudgetUsd) || body.dailyBudgetUsd < 0 || body.dailyBudgetUsd > 100 ||
      typeof body.maxConcurrent !== "number" || !Number.isInteger(body.maxConcurrent) || body.maxConcurrent < 1 || body.maxConcurrent > 8) {
      throw new ApiError("Budget must be $0–100 and concurrency must be 1–8.", 400);
    }
    await operationsSettings();
    const micros = Math.round(body.dailyBudgetUsd * 1_000_000), now = new Date().toISOString();
    await operationsDatabase().batch([
      operationsDatabase().prepare("UPDATE operations_settings SET daily_budget_micros=?,enabled=?,max_concurrent=?,updated_at=? WHERE id=1")
        .bind(micros, Number(body.enabled), body.maxConcurrent, now),
      operationsDatabase().prepare("INSERT INTO operations_audit VALUES(?,?,?,?)").bind(crypto.randomUUID(), user.userId,
        `Budget $${body.dailyBudgetUsd}; AI ${body.enabled ? "enabled" : "paused"}; concurrency ${body.maxConcurrent}`, now),
    ]);
    return Response.json(await operationsSnapshot(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiErrorResponse(error); }
}
