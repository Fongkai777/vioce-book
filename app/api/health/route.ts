import { getOpenAIConfig } from "@/lib/openai";
import { env } from "cloudflare:workers";
import { inspectAuthClientIp } from "@/lib/auth";

export async function GET(request?: Request) {
  if (request) inspectAuthClientIp(request); // Logs status only, never the visitor IP.
  try {
    const config = getOpenAIConfig();
    if (!env.DB) throw new Error("Database is unavailable");
    // Readiness covers real D1 access and required schema, not a paid provider probe.
    await env.DB.prepare(`SELECT (SELECT COUNT(*) FROM operations_settings),
      (SELECT COUNT(*) FROM operations_usage), (SELECT COUNT(*) FROM operations_leases), (SELECT COUNT(*) FROM operations_costs),
      (SELECT COUNT(*) FROM operations_metrics), (SELECT COUNT(*) FROM operations_audit),
      (SELECT COUNT(*) FROM app_users), (SELECT COUNT(*) FROM daily_usage),
      (SELECT COUNT(*) FROM reader_preferences), (SELECT COUNT(*) FROM answer_feedback),
      (SELECT COUNT(*) FROM auth_sessions), (SELECT COUNT(*) FROM quota_overrides),
      (SELECT COUNT(*) FROM auth_registration_days)`).first();
    return Response.json({
      ok: true, database: "ready", provider: "configured-not-probed",
      models: {
        answer: config.qaModel,
        ocr: config.ocrModel,
        transcription: config.transcribeModel,
        speech: config.ttsModel,
        embedding: "text-embedding-3-small",
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false, error: "Service is not ready" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
