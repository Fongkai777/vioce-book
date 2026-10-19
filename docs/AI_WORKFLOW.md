# AI-assisted workflow

[中文](AI_WORKFLOW.zh-CN.md) · [Project overview](../README.md)

## How AI was used

- **Implementation and Sites deployment:** OpenAI Codex, working in short slices against explicit acceptance criteria.
- **Independent review and live testing:** Claude reviewed the repository without the implementation context, measured suspected problems before reporting them, drove the deployed app in Chrome with synthetic speech into a real microphone, and proposed patches.
- **My role:** I turned the assignment into acceptance criteria, chose which findings to act on, rejected suggestions that traded one risk for another, and required evidence (a benchmark, a failing test or a live observation) before accepting a change.

No AI output was merged on its own say-so. Every change below came with a reproduction and a regression test, or a recorded live result.

## Case studies

### 1. A plausible-looking ranking function that froze the page

**Found by:** code review. BM25 recomputed document frequency by scanning every passage for every query term: O(passages² × length).

**Verified before fixing:** a 1,500-passage synthetic book took **1.8 s** per question on the main thread.

**Fix:** precompute document frequency once and cache per-passage term statistics. Accepted only after confirming the scores were **identical** to the old implementation on English and Chinese queries. Result: 0.24 s on the first question and about 25 ms afterwards. A later commit persisted the statistics in IndexedDB, so reopening a book does no re-tokenization.

**Judgment:** the original code passed its unit tests. The tests checked correctness, not cost, so the regression test now asserts a time budget as well.

### 2. Quota charged for requests the server refused

**Found by:** review of the order of operations. Allowance was consumed before the global budget gate, so a "site is busy" 429 still cost the reader a question.

**Fix:** refund the allowance when the server fails a request (budget, pause or concurrency denial, provider error, invalid model output). A reader-initiated cancellation keeps its charge, and the global spend reservation is never refunded.

**Judgment:** "refund everything on failure" was rejected. It would hide real provider cost from the budget and let cancellation become free retries.

### 3. Three rounds of login hardening, each with a new trade-off

1. **Original:** throttle per IP + username. Review showed rotating IPs bypassed it, and response timing revealed whether a username existed.
2. **Round two:** added per-account and per-IP buckets, plus a dummy password derivation for unknown users. The next review found that the public default username `admin` let anyone lock the administrator out indefinitely. Without Cloudflare's IP header, every visitor would also have shared one global bucket.
3. **Round three:** administrators are exempt from the cross-IP lock but keep the pair/IP limits; password re-confirmation is counted per session; a missing or spoofed IP header now fails closed with a privacy-preserving diagnostic.

**Judgment:** each hardening step created an availability risk that tests had not covered. Two suggestions were rejected: trusting `X-Forwarded-For`, which is spoofable, and raising PBKDF2 iterations without benchmarking the Worker runtime. The remaining gap is documented in [security](../SECURITY.md).

### 4. A live voice test that unit tests could not replace

All offline tests passed, yet a real-microphone run on the deployed app (v32) answered 2 of 7 questions wrongly, answered an English question in Chinese, and labelled citations "CHORUS.".

**Diagnosis:** the retrieval query concatenated the previous question and recalled earlier answers, so a new topic retrieved passages from old ones. The obvious instinct is to give the model *more* context. The fix was to separate two concerns: the answer model still receives the full conversation, but search uses the question alone unless it depends on the previous turn (pronouns, "and/why/what about", very short follow-ups).

**Rejected:** an LLM query-rewrite step. It is more general but adds latency and cost to every turn; the heuristic fixed the measured cases.

**Verified:** offline replay of the same conversation, then a live re-run on v33. The Cheshire Cat question went from wrong to correct and the English-language answer was fixed; the story-ending question improved only partly, which is recorded as such.

### 5. The re-run found the next bug

The same v33 run showed spoken answers cut off with "Too many AI requests are running". Both speech segments were requested at once, filling the account's two in-flight slots, so any other running request caused a 429.

**Fix:** request segments sequentially (the next one downloads while the previous plays) and retry only the transient concurrency 429; daily or budget limits are never retried.

**Lesson:** fixing one problem and re-testing live surfaced the next. The full record, including failures, is in the [validation log](EVALUATION-LOG.md).

## Prompting practices that reduced iterations

- **State the acceptance evidence up front:** "measure it before reporting it", "show the failing case", "replay the same conversation in the same order". Reviews then arrived with numbers instead of opinions.
- **Ask for verified versus plausible findings separately,** and for the concrete failure scenario behind each one.
- **Keep the diagnosis and the fix in separate turns** when a fix has trade-offs (cases 2–4), so the choice stays mine.
- **Require documentation in the same change:** every fix updates the changelog, the bilingual docs and the validation log, so documents cannot drift from code.

## Standing engineering choices

- Section-aware chunks, BM25 plus embeddings and reciprocal-rank fusion, because fixed-size dense-only chunking has poor recall and the two scores are not directly comparable.
- Page numbers come from parsing, never from the model; unknown pages are shown as unknown.
- Books and indexes stay in account-scoped browser storage, with the trade-offs documented.

## Review protocol

AI-generated code is accepted only when deterministic logic has focused tests, lint, types and the production build pass, secrets and data boundaries are reviewed, API payloads match current provider documentation, and user-visible loading, error, empty and permission-denied states have been exercised.

## A note on commit history

About thirty commits titled "Update Site source" were created automatically by the Sites hosting platform when publishing. They are kept rather than rewritten, because force-pushing public history would break existing links. Commits after the review cycle use descriptive messages.
