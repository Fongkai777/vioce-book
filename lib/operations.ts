import { env } from "cloudflare:workers";
import { ApiError, apiErrorResponse } from "./errors";
import { singaporeDate, requireApiUser } from "./quota";
import { assertSameOrigin } from "./request-security";
import { boundedRequest, readBounded } from "./bounded-request";

export function operationsDatabase() {
  if (!env.DB) throw new Error("Operations database is unavailable");
  return env.DB;
}

export type ProviderOperation = "answer" | "embed" | "ocr" | "transcribe" | "speech" | "history/summary";
type Settings = { daily_budget_micros: number; enabled: number; max_concurrent: number; updated_at: string };
const limits: Record<ProviderOperation, number> = {
  answer: 450_000, embed: 3_200_000, ocr: 8_010_000, transcribe: 6_500_000, speech: 40_000, "history/summary": 32_000,
};
export async function operationsSettings() {
  await operationsDatabase().prepare("INSERT INTO operations_settings(id,updated_at) VALUES(1,?) ON CONFLICT(id) DO NOTHING").bind(new Date().toISOString()).run();
  const row = await operationsDatabase().prepare("SELECT * FROM operations_settings WHERE id=1").first<Settings>();
  if (!row) throw new Error("Operations settings unavailable");
  return row;
}
export async function auditOperation(actor: string, action: string) {
  await operationsDatabase().prepare("INSERT INTO operations_audit VALUES(?,?,?,?)").bind(crypto.randomUUID(), actor, action, new Date().toISOString()).run();
}

// Reservation policy v1, NOT a provider invoice. UTF-8 byte count deliberately
// overestimates text tokens. Unknown/custom model prices need operator review.
// No refunds: a timeout/abort can still have incurred provider charges.
export function estimateReservation(kind: ProviderOperation, body: BodyInit | null | undefined) {
  if (kind === "transcribe") return 1_000_000; // fixed $1 per capped audio upload, ignores client duration
  const size = typeof body === "string" ? new TextEncoder().encode(body).length : 0;
  if (!size) throw new ApiError("Cannot reserve provider usage", 503);
  if (kind === "ocr") return 500_000;
  if (kind === "speech") return Math.max(10_000, size * 100);
  if (kind === "embed") return Math.max(1_000, size * 2);
  const output = kind === "history/summary" ? 1800 : 2200;
  return Math.max(10_000, size * 10 + output * 40);
}
export async function reserveProvider(userId: string, amount: number, now = Date.now()) {
  if (!Number.isSafeInteger(amount) || amount < 1) throw new ApiError("Invalid reservation", 400);
  await operationsSettings();
  const date = singaporeDate(new Date(now)), id = crypto.randomUUID();
  const result = await operationsDatabase().batch([
    operationsDatabase().prepare("DELETE FROM operations_leases WHERE expires_at<=?").bind(now),
    operationsDatabase().prepare("INSERT INTO operations_usage(date) VALUES(?) ON CONFLICT(date) DO NOTHING").bind(date),
    operationsDatabase().prepare(`UPDATE operations_usage SET reserved_micros=reserved_micros+?, requests=requests+1 WHERE date=?
      AND EXISTS(SELECT 1 FROM operations_settings WHERE id=1 AND enabled=1 AND daily_budget_micros>=reserved_micros+?
        AND (SELECT COUNT(*) FROM operations_leases)<max_concurrent)
      AND (SELECT COUNT(*) FROM operations_leases WHERE user_id=?)<2`).bind(amount, date, amount, userId),
    operationsDatabase().prepare("INSERT INTO operations_leases(id,user_id,expires_at) SELECT ?,?,? WHERE changes()=1").bind(id, userId, now + 180_000),
  ]);
  if (result[3].meta.changes !== 1) throw new ApiError("AI is paused, busy, or the site daily budget has been reached. Please try later or contact the administrator.", 429);
  return id;
}
export async function releaseProvider(id: string) { await operationsDatabase().prepare("DELETE FROM operations_leases WHERE id=?").bind(id).run(); }

export async function providerFetch(kind: ProviderOperation, userId: string, url: string, init: RequestInit) {
  const lease = await reserveProvider(userId, estimateReservation(kind, init.body));
  const timeout = AbortSignal.timeout(120_000);
  try {
    const upstream = await fetch(url, { ...init, signal: init.signal ? AbortSignal.any([init.signal, timeout]) : timeout });
    // Keep lease through body consumption (including TTS), not just response headers.
    const body = await readBounded(upstream.body, 16_000_000);
    return new Response(body, { status: upstream.status, headers: upstream.headers });
  } finally { await releaseProvider(lease); }
}

async function recordMetric(route: string, status: number, elapsed: number) {
  const date = singaporeDate(), now = new Date().toISOString();
  await operationsDatabase().prepare(`INSERT INTO operations_metrics(date,route,status,count,total_ms,max_ms,last_at) VALUES(?,?,?,1,?,?,?)
    ON CONFLICT(date,route,status) DO UPDATE SET count=count+1,total_ms=total_ms+excluded.total_ms,max_ms=MAX(max_ms,excluded.max_ms),last_at=excluded.last_at`)
    .bind(date, route, status, elapsed, elapsed, now).run();
}
export function monitoredRoute(route: string, handler: (request: Request) => Promise<Response>, byteLimit?: number, authenticated = true) {
  return async (request: Request) => {
    const started = Date.now(), requestId = crypto.randomUUID();
    let response: Response;
    try {
      assertSameOrigin(request);
      if (authenticated) await requireApiUser();
      response = await handler(byteLimit ? await boundedRequest(request, byteLimit) : request);
    } catch (error) { response = apiErrorResponse(error); }
    const elapsed = Date.now() - started;
    try { await recordMetric(route, response.status, elapsed); }
    catch { console.error(JSON.stringify({ event: "metrics_unavailable", route, requestId })); }
    // Fixed route names only; no URL, identity, prompt, credential or error body.
    if (response.status >= 500) console.error(JSON.stringify({ event: "request_failed", route, status: response.status, elapsedMs: elapsed, requestId }));
    response.headers.set("X-Request-Id", requestId);
    response.headers.set("Cache-Control", "no-store");
    return response;
  };
}
export function aiRoute(kind: ProviderOperation, handler: (request: Request) => Promise<Response>) {
  return monitoredRoute(kind, handler, limits[kind]);
}
export async function operationsSnapshot() {
  const settings = await operationsSettings(), date = singaporeDate();
  // Lazy retention on admin refresh; no scheduler or background job required.
  const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  await operationsDatabase().prepare("DELETE FROM operations_metrics WHERE date<?").bind(cutoff).run();
  const [usage, metrics, audit] = await Promise.all([
    operationsDatabase().prepare("SELECT * FROM operations_usage WHERE date=?").bind(date).first<{ reserved_micros: number; requests: number }>(),
    operationsDatabase().prepare("SELECT * FROM operations_metrics WHERE date=? ORDER BY route,status").bind(date).all(),
    operationsDatabase().prepare("SELECT action,created_at FROM operations_audit ORDER BY created_at DESC LIMIT 20").all(),
  ]);
  const rows = metrics.results as Array<{count: number; status: number; total_ms: number}>;
  const requests = rows.reduce((n, r) => n + r.count, 0), errors = rows.reduce((n, r) => n + (r.status >= 500 ? r.count : 0), 0);
  const reserved = usage?.reserved_micros || 0;
  return { date, settings, reservedMicros: reserved, providerRequests: usage?.requests || 0, requests, errors,
    averageMs: requests ? Math.round(rows.reduce((n, r) => n + r.total_ms, 0) / requests) : 0,
    metrics: metrics.results, audit: audit.results, alerts: [
      ...(!settings.enabled ? ["AI requests are paused."] : []),
      ...(reserved >= settings.daily_budget_micros * 0.8 ? ["Daily reserved budget is at or above 80%."] : []),
      ...(requests >= 5 && errors / requests >= 0.1 ? ["At least 10% of today's monitored requests failed (5xx)."] : []),
    ] };
}
