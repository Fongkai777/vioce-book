# AI cost accounting

[中文](PRICING.zh-CN.md) · [English project overview](../README.md)

Policy v2, verified October 19, 2026. Daily default remains **US$5**, resetting at midnight Singapore time. This is an application spending estimate, not an invoice, and it covers only this application. Keep a provider-side limit for keys shared with other applications.

## Verified standard rates

USD per million tokens; excludes taxes, negotiated discounts, credits and nonstandard service tiers.

| Model | Input | Cached input | Output | Source |
| --- | ---: | ---: | ---: | --- |
| gpt-5-mini | $0.25 | $0.025 | $2.00 | [OpenAI model pricing](https://developers.openai.com/api/docs/models/gpt-5-mini) |
| text-embedding-3-small | $0.02 | — | — | [OpenAI model pricing](https://developers.openai.com/api/docs/models/text-embedding-3-small) |
| gpt-4o-mini-transcribe | $1.25 | — | $5.00 | [OpenAI model pricing](https://developers.openai.com/api/docs/models/gpt-4o-mini-transcribe) |
| gpt-4o-mini-tts | $0.60 text | — | $12.00 audio | [OpenAI model pricing](https://developers.openai.com/api/docs/models/gpt-4o-mini-tts) |

The transcription model page currently lists the input/output token rates above; the [pricing overview](https://developers.openai.com/api/docs/pricing) also gives an approximate **$0.003/minute** reference, not a fixed per-request fee. Recheck published modality-specific rates and the provider bill when upgrading models. The price registry is versioned in `lib/provider-pricing.ts`; it is not automatically refreshed from the web.

## Reserve, then reconcile

1. Only exact supported model IDs/snapshots at `https://api.openai.com/v1/` use these rates. Proxy URLs, unknown models and the legacy Alibaba embedding path retain the clearly labeled v1 fallback; OpenAI prices are not silently applied to another vendor/currency.
2. Text requests pre-reserve an upper token estimate: serialized UTF-8 bytes plus 256 for overhead, priced at the model's input rate, plus the **actual request output cap** at its output rate. This is not exact tokenization; it deliberately over-reserves before the response is available. OCR retains a $0.50 pre-reserve because base64 length is not image token usage.
3. Valid successful response `usage` replaces that request's reserve with token-priced cost. Non-cached and cached input are priced separately. Output includes reasoning tokens; reasoning is never added twice. Embeddings use `prompt_tokens`. Costs round up to a USD micro (minimum one micro).
4. Settlement and daily-total adjustment are one idempotent D1 transaction, associated with the admission date, including across Singapore midnight and lease expiration. Concurrent requests cannot release the same reservation twice. A cost above its reserve is fully recorded rather than truncated; later admissions are blocked if the daily limit is exceeded. This is therefore not a guaranteed provider hard cap.
5. Missing, malformed or mismatched-model usage, non-2xx responses, timeouts and aborted body reads **retain the reserve**. A failed settlement logs a metadata-only event and keeps the existing reserve. Neither an error nor pressing Stop proves that the provider charged nothing. Account question/voice quotas remain separate from money and are not refunded by cost reconciliation.

For example, 10,000 uncached input tokens and 1,000 output tokens with gpt-5-mini cost **$0.0045** at these rates. Inputs include instructions, retrieved book passages and conversation context, not just the latest question.

## Audio boundaries

Transcription accepts the app's canonical 16 kHz, mono, 16-bit PCM WAV. The server verifies its format, exact data length and duration (greater than zero, at most 60 seconds). It does not trust `durationSeconds` sent by a browser. Compressed, ambiguous or forged containers are rejected before quota/provider work. Reserve: twice the per-minute reference estimate, plus the complete 2,000-output-token cap and 512 prompt-token allowance. Valid token `usage` then reconciles it. Missing usage keeps this estimate, not the old fixed dollar.

TTS currently returns binary MP3, without usage metadata. **It remains estimated**, using the text byte upper estimate at $0.60/M and an explicit heuristic of 20 output audio tokens per Unicode character (minimum 500) at $12/M. This is neither a measured output-token count nor a guaranteed upper bound. The UI labels it `openai-tts-estimate-2026-10-19`. Adding verified TTS usage streaming is a future improvement; this release intentionally does not change playback transport or claim that all audio is measured.

## Administrator display and migration

The total is split into usage-priced cost, outstanding estimates/pending work, and legacy/restored estimates. A model table shows provider-reported input/cached/output tokens, request counts, settled cost and retained estimates. Tokens missing from legacy records are not invented. Existing daily totals are **not reset or repriced** by deployment. After migration, old reservations remain in the daily total until the normal day rollover.

An administrator may explicitly confirm **Clear today's legacy estimates** once per Singapore day. It removes only the current aggregate minus all recorded v2 costs/reservations, with an exact date/amount check inside an atomic transaction. New costs, request counts, personal allowances, historical dates and the daily cap remain unchanged. The audit row records the administrator, removed USD micros and before/after totals; duplicate/stale attempts do not deduct again. This is a budget adjustment, not deletion of accounting evidence or a refund from the provider. A previous backup may reintroduce the old aggregate on restore; the once-per-day audit marker is preserved, preventing a second automatic deduction.

The new `operations_costs` ledger stores request IDs, day, model, price-policy version, amounts and token counts only: no user ID, prompts, book passages, audio or credentials. It and the control plane are preserved during same-site server restore. Existing backup format includes aggregate daily totals but not this new diagnostic ledger, so cross-site recovery keeps the total as legacy/restored estimates. Schema migrations are additive and do not backfill or delete data.

## Verification

Offline tests cover published-rate arithmetic, cached input, reasoning tokens, invalid usage, unknown/proxy fallbacks, WAV validation, idempotent settlement, over-reserve costs, concurrent admission, day rollover and preserved old totals. Provider tests use synthetic usage, never paid calls. Check real bills periodically; unit tests cannot establish that a supplier's pricing never changes.
