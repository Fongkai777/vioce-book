import { authHeaders, getOpenAIConfig, jsonError, openAIError } from "@/lib/openai";
import { apiErrorResponse, consumeQuota, requireApiUser } from "@/lib/quota";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { text?: unknown };
    const text = String(body.text || "").trim().slice(0, 5000);
    if (!text) return jsonError(new Error("Text is required"), 400);
    const user = await requireApiUser();
    await consumeQuota(user, "speech", text.length);
    const config = getOpenAIConfig();
    const upstream = await fetch(`${config.baseUrl}/audio/speech`, {
      method: "POST",
      headers: { ...authHeaders(config.apiKey), "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.ttsModel,
        voice: config.ttsVoice,
        input: text.replace(/\[S\d+\]/g, ""),
        instructions: "Speak like a thoughtful audiobook guide: warm, clear, measured, and natural.",
        response_format: "mp3",
      }),
    });
    if (!upstream.ok) throw await openAIError(upstream);
    return new Response(upstream.body, {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
