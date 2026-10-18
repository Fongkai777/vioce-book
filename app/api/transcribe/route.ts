import { authHeaders, getOpenAIConfig, jsonError, openAIError } from "@/lib/openai";
import { apiErrorResponse, consumeQuota, getQuotaSnapshot, requireApiUser } from "@/lib/quota";

export async function POST(request: Request) {
  try {
    const incoming = await request.formData();
    const audio = incoming.get("audio");
    const durationSeconds = Math.ceil(Number(incoming.get("durationSeconds")));
    if (!(audio instanceof File) || !audio.size) return jsonError(new Error("Audio recording is required"), 400);
    if (audio.size > 24 * 1024 * 1024) return jsonError(new Error("Audio recording is too large"), 413);
    if (!Number.isFinite(durationSeconds) || durationSeconds < 1 || durationSeconds > 60) {
      return jsonError(new Error("Voice questions must be between 1 and 60 seconds"), 400);
    }

    const user = await requireApiUser();
    await consumeQuota(user, "voice", durationSeconds);

    const config = getOpenAIConfig();
    const form = new FormData();
    form.append("file", audio, audio.name || "question.webm");
    form.append("model", config.transcribeModel);
    form.append("response_format", "json");
    form.append("prompt", "Transcribe the reader's question accurately. Preserve book titles, names, and technical terms.");
    const upstream = await fetch(`${config.baseUrl}/audio/transcriptions`, {
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(90_000)]),
      method: "POST",
      headers: authHeaders(config.apiKey),
      body: form,
    });
    if (!upstream.ok) throw await openAIError(upstream);
    const payload = (await upstream.json()) as { text?: string };
    return Response.json({ text: payload.text?.trim() || "", quota: await getQuotaSnapshot(user) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
