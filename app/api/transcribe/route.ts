import { aiRoute, providerFetch } from "@/lib/operations";
import { assertSameOrigin } from "@/lib/request-security";
import { authHeaders, getOpenAIConfig, jsonError, openAIError } from "@/lib/openai";
import { apiErrorResponse, consumeQuota, getQuotaSnapshot, refundOnFailure, requireApiUser } from "@/lib/quota";
import { verifiedVoiceSeconds } from "@/lib/provider-pricing";

export const POST = aiRoute("transcribe", async (request: Request) => {
  try {
    assertSameOrigin(request);
    const incoming = await request.formData();
    const audio = incoming.get("audio");
    if (!(audio instanceof File) || !audio.size) return jsonError(new Error("Audio recording is required"), 400);
    if (audio.size > 6 * 1024 * 1024) return jsonError(new Error("Audio recording is too large"), 413);
    const user = await requireApiUser();
    let durationSeconds: number;
    try { durationSeconds = await verifiedVoiceSeconds(audio); }
    catch (error) { return jsonError(error, 400); }
    const receipt = await consumeQuota(user, "voice", Math.ceil(durationSeconds));
    return await refundOnFailure(receipt, request.signal, async () => {

      const config = getOpenAIConfig();
      const form = new FormData();
      form.append("file", audio, audio.name || "question.webm");
      form.append("model", config.transcribeModel);
      form.append("response_format", "json");
      form.append("prompt", "Transcribe the reader's question accurately. Preserve book titles, names, and technical terms.");
      const upstream = await providerFetch("transcribe", user.userId, `${config.baseUrl}/audio/transcriptions`, {
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(90_000)]),
        method: "POST",
        headers: authHeaders(config.apiKey),
        body: form,
      }, {audioSeconds: durationSeconds});
      if (!upstream.ok) throw await openAIError(upstream);
      const payload = (await upstream.json()) as { text?: string };
      return Response.json({ text: payload.text?.trim() || "", quota: await getQuotaSnapshot(user) });
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
});
