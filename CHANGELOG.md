# Changelog

[中文](CHANGELOG.zh-CN.md) · [Project overview](README.md)

Entries describe delivered changes, not an unrestricted-production certification. Public Git history is retained. Current hosted provenance is in the [deployment record](docs/DEPLOYMENT.md); dated test evidence is in [evaluation](docs/EVALUATION.md).

## 2026-10-20 — Reduce speech-segment concurrency failures

- Speech segments are requested one at a time (the next while the previous plays) instead of all at once, so one reply never fills both of an account's in-flight AI slots; a transient "busy" 429 is retried briefly and cancellation stops retries. Daily and budget limits are never retried.
- Recorded the v33 live re-run: the topic-change, language and section-label fixes were confirmed; this speech failure was found in the same run.

## 2026-10-20 — Retrieval and answer-language fixes (from a live voice run)

- Retrieval no longer mixes earlier questions and answers into the search query; only dependent follow-ups borrow the previous question. The full conversation still goes to the answer model.
- Each answer request explicitly asks for the language detected from the current question; the v33 English-question sample answered in English. This is a prompt instruction, not a guarantee for every model response.
- Books with explicit chapter headings no longer turn all-caps songs or choruses into citation section labels. Existing saved books keep their stored passages until re-uploaded.
- Recorded the 2026-10-20 live microphone results, including failures, in the [validation log](docs/EVALUATION-LOG.md).

## 2026-10-19 — Documentation

- Added the English user guide and aligned quota refunds, regular-account administration and CI instructions across both languages.
- Separated evaluation conclusions from historical experiment logs, including known failures; removed private-book titles from public test descriptions.
- Split lint policy and changelog into English/Chinese files, and added a deployment/commit map. Removed obsolete private-library migration instructions from the reader-facing feature guide; maintenance code remains available.

## 2026-10-19 — Storage and access controls (`cd4187a`)

- Persisted BM25 statistics in account-scoped IndexedDB content records with version/fingerprint validation, lazy legacy upgrades and concurrent-save/delete protection. No re-embedding required.
- Exempted active administrators from cross-IP account lockout while retaining pair/IP limits; isolated authenticated password confirmations by session.
- Rejected missing/invalid/shared production IP headers with privacy-preserving diagnostics; added lint to CI with documented, scoped React integration exceptions.

## 2026-10-19 — Account management and reader structure (`6786eb8`–`583bb67`)

- Added audited disable/enable and password-reset controls for regular users, with administrator reauthentication, session revocation and transactional rollback.
- Hardened login timing and account-change races; standardized reader UI copy in English while retaining Chinese answers and compatible saved feedback.
- Split PDF processing, library loading, chat persistence and audio playback into modules; removed unused UI templates. Dependency cleanup remains subject to separate compatibility review.
- Streamlined bilingual entry points and updated repository links to `voice-book`.

## 2026-10-19 — Retrieval and quota handling

- Cached retrieval statistics and named ranking constants; reused successful retrieval for same-message retries.
- Returned personal allowance on server-caused failures while keeping caller cancellations charged and global cost reserves separate.

## Ongoing limits

PBKDF2 remains at 100,000 iterations; stronger hashing requires runtime validation and migration. Client-supplied excerpts are not server-authenticated. Human/device acoustic validation, broader grounding benchmarks and production recovery guarantees remain incomplete. See [security](SECURITY.md) and [release gates](docs/OPERATIONS.md#gates-before-unrestricted-production-access).
