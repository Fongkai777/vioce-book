import { authHeaders, getOpenAIConfig, jsonError, openAIError } from "@/lib/openai";

export async function POST(request: Request) {
  try {
    const incoming = await request.formData();
    const audio = incoming.get("audio");
    if (!(audio instanceof File) || !audio.size) return jsonError(new Error("Audio recording is required"), 400);
    if (audio.size > 24 * 1024 * 1024) return jsonError(new Error("Audio recording is too large"), 413);

    const config = getOpenAIConfig();
    const form = new FormData();
    form.append("file", audio, audio.name || "question.webm");
    form.append("model", config.transcribeModel);
    form.append("response_format", "json");
    form.append("prompt", "Transcribe the reader's question accurately. Preserve book titles, names, and technical terms.");
    const upstream = await fetch(`${config.baseUrl}/audio/transcriptions`, {
      method: "POST",
      headers: authHeaders(config.apiKey),
      body: form,
    });
    if (!upstream.ok) throw await openAIError(upstream);
    const payload = (await upstream.json()) as { text?: string };
    return Response.json({ text: payload.text?.trim() || "" });
  } catch (error) {
    return jsonError(error);
  }
}
