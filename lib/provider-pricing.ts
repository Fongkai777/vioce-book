// USD per million tokens (numerically equal to USD micros per token).
// Verified 2026-10-19. Sources and estimation limits: docs/PRICING.md.
export type ProviderOperation = "answer" | "embed" | "ocr" | "transcribe" | "speech" | "history/summary";
type RecordValue = Record<string, unknown>;
export type PriceQuote = { model: string; policy: string; micros: number; inputRate?: number; cachedRate?: number; outputRate?: number };
const encoder = new TextEncoder();
const bytes = (text: string) => encoder.encode(text).length;
const object = (value: unknown): RecordValue => value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
const count = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 100_000_000;
const micros = (value: number) => Math.max(1, Math.ceil(value));

function fallback(kind: ProviderOperation, size: number) {
  if (kind === "transcribe") return 1_000_000;
  if (kind === "ocr") return 500_000;
  if (kind === "speech") return Math.max(10_000, size * 100);
  if (kind === "embed") return Math.max(1_000, size * 2);
  return Math.max(10_000, size * 10 + (kind === "history/summary" ? 1800 : 2200) * 40);
}

export function quoteProvider(kind: ProviderOperation, body: BodyInit | null | undefined, url: string, audioSeconds?: number): PriceQuote {
  let data: RecordValue = {};
  if (typeof body === "string") { try { data = object(JSON.parse(body)); } catch { /* fail-safe fallback */ } }
  const model = body instanceof FormData ? String(body.get("model") || "") : String(data.model || "");
  const size = typeof body === "string" ? bytes(body) : 0;
  const result: PriceQuote = {model, policy: "unverified-fallback-v1", micros: fallback(kind, size)};
  // Do not assign official prices to a proxy or to an unrecognized model.
  let official = false;
  try { const target = new URL(url); official = target.origin === "https://api.openai.com" && target.pathname.startsWith("/v1/"); } catch { /* fallback */ }
  if (!official) return result;
  const textTokensUpper = size + 256; // byte-level token upper estimate + message overhead; NOT an exact tokenizer
  if (["answer", "history/summary", "ocr"].includes(kind) && ["gpt-5-mini", "gpt-5-mini-2025-08-07"].includes(model)) {
    const output = data.max_output_tokens;
    if (!count(output) || output < 1) return result;
    // Images are encoded in input tokens, not base64 text tokens. Keep the
    // existing OCR preflight reserve, then reconcile using provider usage.
    return {model, policy:"openai-2026-10-19", inputRate:0.25, cachedRate:0.025, outputRate:2,
      micros: kind === "ocr" ? 500_000 : micros(textTokensUpper * 0.25 + output * 2)};
  }
  if (kind === "embed" && model === "text-embedding-3-small") {
    return {model, policy:"openai-2026-10-19", inputRate:0.02, outputRate:0, micros:micros(textTokensUpper * 0.02)};
  }
  if (kind === "transcribe" && ["gpt-4o-mini-transcribe", "gpt-4o-mini-transcribe-2025-12-15", "gpt-4o-mini-transcribe-2025-03-20"].includes(model)
    && typeof audioSeconds === "number" && Number.isFinite(audioSeconds) && audioSeconds > 0 && audioSeconds <= 60) {
    // Verified PCM duration only. $0.003/min reference estimate, 2x margin,
    // plus the full 2,000-token output cap and prompt allowance.
    return {model, policy:"openai-2026-10-19", inputRate:1.25, outputRate:5,
      micros:micros(audioSeconds * 100 + 2000 * 5 + 512 * 1.25)};
  }
  if (kind === "speech" && ["gpt-4o-mini-tts", "gpt-4o-mini-tts-2025-12-15", "gpt-4o-mini-tts-2025-03-20"].includes(model)) {
    const characters = Array.from(typeof data.input === "string" ? data.input : "").length;
    // Binary MP3 responses contain no usage. This is explicitly an estimate:
    // 20 output audio tokens per Unicode character (minimum 500), not a bill.
    return {model, policy:"openai-tts-estimate-2026-10-19", inputRate:0.6, outputRate:12,
      micros:micros(textTokensUpper * 0.6 + Math.max(500, characters * 20) * 12)};
  }
  return result;
}

export type PricedUsage = { micros: number; inputTokens: number; cachedTokens: number; outputTokens: number };
export function priceUsage(quote: PriceQuote, payload: unknown): PricedUsage | null {
  if (quote.policy !== "openai-2026-10-19" || quote.inputRate === undefined || quote.outputRate === undefined) return null;
  const response = object(payload), usage = object(response.usage);
  // Only price the exact configured model/supported snapshot family.
  if (response.model !== undefined && response.model !== quote.model &&
    !(quote.model === "gpt-5-mini" && response.model === "gpt-5-mini-2025-08-07") &&
    !(quote.model === "gpt-4o-mini-transcribe" && ["gpt-4o-mini-transcribe-2025-03-20", "gpt-4o-mini-transcribe-2025-12-15"].includes(String(response.model)))) return null;
  const input = usage.input_tokens ?? usage.prompt_tokens;
  const output = quote.outputRate === 0 ? 0 : usage.output_tokens;
  const details = object(usage.input_tokens_details);
  const cached = details.cached_tokens ?? 0;
  if (!count(input) || !count(output) || !count(cached) || cached > input || (cached > 0 && quote.cachedRate === undefined)) return null;
  if (usage.total_tokens !== undefined && (!count(usage.total_tokens) || usage.total_tokens !== input + output)) return null;
  // output_tokens includes reasoning tokens; never add reasoning_tokens twice.
  const cost = (input - cached) * quote.inputRate + cached * (quote.cachedRate ?? quote.inputRate) + output * quote.outputRate;
  return {micros:micros(cost), inputTokens:input, cachedTokens:cached, outputTokens:output};
}

// Only accept the canonical PCM WAV generated by VoiceCapture. Reject compressed
// or ambiguous containers rather than trusting client-supplied duration metadata.
export async function verifiedVoiceSeconds(audio: Blob): Promise<number> {
  const header = await audio.slice(0, 44).arrayBuffer();
  if (header.byteLength !== 44) throw new Error("Invalid voice recording. Please record again.");
  const view = new DataView(header), tag = (offset: number) => new TextDecoder().decode(header.slice(offset, offset + 4));
  const dataSize = view.getUint32(40, true), seconds = dataSize / 32000;
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE" || tag(12) !== "fmt " || tag(36) !== "data" ||
    view.getUint32(4, true) !== audio.size - 8 || view.getUint32(16, true) !== 16 ||
    view.getUint16(20, true) !== 1 || view.getUint16(22, true) !== 1 || view.getUint32(24, true) !== 16000 ||
    view.getUint32(28, true) !== 32000 || view.getUint16(32, true) !== 2 || view.getUint16(34, true) !== 16 ||
    dataSize !== audio.size - 44 || dataSize % 2 || seconds <= 0 || seconds > 60) {
    throw new Error("Voice recording must be 16 kHz mono PCM WAV, at most 60 seconds. Please record again.");
  }
  return seconds;
}
