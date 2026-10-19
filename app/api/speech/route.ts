import { aiRoute, providerFetch } from "@/lib/operations";
import { assertSameOrigin } from "@/lib/request-security";
import { authHeaders, getOpenAIConfig, jsonError, openAIError } from "@/lib/openai";
import { apiErrorResponse, consumeQuota, refundOnFailure, requireApiUser } from "@/lib/quota";

export const POST = aiRoute("speech", async (request: Request) => {
  try {
    assertSameOrigin(request);
    const body = (await request.json()) as { text?: unknown };
    const text = String(body.text || "").trim().slice(0, 5000);
    if (!text) return jsonError(new Error("Text is required"), 400);
    const user = await requireApiUser();
    const receipt = await consumeQuota(user, "speech", text.length);
    return await refundOnFailure(receipt, request.signal, async () => {
      const config = getOpenAIConfig();
      const upstream = await providerFetch("speech", user.userId, `${config.baseUrl}/audio/speech`, {
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(90_000)]),
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
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
});
