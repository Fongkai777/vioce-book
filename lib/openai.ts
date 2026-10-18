import { ApiError, apiErrorResponse } from "./errors";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";

export function getOpenAIConfig() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");
  return {
    apiKey,
    baseUrl: (process.env.OPENAI_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, ""),
    qaModel: process.env.OPENAI_QA_MODEL || "gpt-5-mini",
    ocrModel: process.env.OPENAI_OCR_MODEL || process.env.OPENAI_QA_MODEL || "gpt-5-mini",
    transcribeModel: process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe",
    ttsModel: process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts",
    ttsVoice: process.env.OPENAI_TTS_VOICE || "coral",
  };
}

export function authHeaders(apiKey: string) {
  return { Authorization: `Bearer ${apiKey}` };
}

export async function openAIError(response: Response) {
  // Providers can echo keys or submitted excerpts in errors; expose neither.
  await response.body?.cancel().catch(() => {});
  return new ApiError(response.status === 429
    ? "The AI service is busy or unavailable. Please try again later."
    : "The AI service could not complete this request. Please try again later.",
  response.status === 429 ? 503 : 502);
}

export function responseText(payload: {
  output_text?: string;
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
}) {
  if (payload.output_text) return payload.output_text;
  return (payload.output || [])
    .flatMap((item) => item.content || [])
    .filter((item) => item.type === "output_text" && item.text)
    .map((item) => item.text)
    .join("\n")
    .trim();
}

export function jsonError(error: unknown, status = 500) {
  return apiErrorResponse(new ApiError(status < 500 && error instanceof Error
    ? error.message : "The service could not complete this request. Please try again later.", status));
}
