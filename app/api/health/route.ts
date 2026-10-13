import { getOpenAIConfig } from "@/lib/openai";

export async function GET() {
  try {
    const config = getOpenAIConfig();
    return Response.json({
      ok: true,
      models: {
        answer: config.qaModel,
        transcription: config.transcribeModel,
        speech: config.ttsModel,
        embedding: "text-embedding-3-small",
      },
    });
  } catch {
    return Response.json({ ok: false, error: "Server API key is not configured" }, { status: 503 });
  }
}
