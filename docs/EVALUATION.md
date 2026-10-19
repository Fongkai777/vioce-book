# Testing and answer-quality evaluation

[中文](EVALUATION.zh-CN.md) · [Project overview](../README.md) · [Historical log](EVALUATION-LOG.md)

## Results at a glance

The core assignment flow has recorded acceptance evidence. This remains a controlled demo: the larger grounding benchmark, human/device acoustic validation and unrestricted-production checks are not complete.

| What | How tested | Result and boundary | Evidence |
| --- | --- | --- | --- |
| Automated regression | Actual modules; fake IndexedDB, isolated SQLite, mocked providers | **150/150 passed on 2026-10-19 at `cd4187a`**; use current runner output for later commits | [Tests](../tests), [CI](https://github.com/Fongkai777/voice-book/actions/workflows/ci.yml) |
| Static/release checks | Zero-warning lint, TypeScript, private-file/history scan, Worker/client build | Passed locally at the same baseline; remote CI status is separate | [Workflow](../.github/workflows/ci.yml), [lint policy](LINT.md) |
| Long-book ingestion and grounding | Fresh 12-chapter / 56-page public PDF; four questions on deployed v28 | Three factual answers supported; one refusal did not invent a number. Extra refusal citations remain a weakness. This text PDF did not exercise OCR | [Report and source-page cases](acceptance/README.md), [screenshots/demo](acceptance/demo.mp4) |
| Voice and continuity | Synthetic speech through speakers/real microphone; local synthetic-audio harness | Four public-book turns auto-submitted; citations and refresh recovery passed. Earlier eight-turn test exposed empty-sound interruption and recognition errors; not human-speech certification | [Public observations](acceptance/browser-observations.json), [acoustic log](EVALUATION-LOG.md) |
| Retrieval persistence | Serialized BM25 restore; invalid cache; concurrent delete/save | Same English/Chinese scores, no passage retokenization on reopen, owner isolation, no re-embedding/network | [Cache tests](../tests/bm25-persistence.test.mjs), [ranking tests](../tests/retrieval.test.mjs) |
| Login and account control | Real routes over disposable SQLite; concurrent and rotating-IP attempts | Admin reauthentication isolated from public login; ordinary-user disable/reset revokes sessions; invalid production IP headers rejected | [Security tests](../tests/server-security.test.mjs), [policy](../SECURITY.md) |
| Quota, budget and recovery | Provider/gate failures, overlapping calls, encrypted backup and rollback | Failed endpoint's personal allowance refunded; cancellation keeps it. Global reserve is separate. No real production restore performed | [Route tests](../tests/server-security.test.mjs), [backup tests](../tests/backup.test.mjs), [operations](OPERATIONS.md) |
| Preferences and account isolation | Local built Worker/browser with synthetic providers; small live-provider comparisons | Saved preferences, explicit feedback/rewrite and account separation observed. Ratings do not silently change preferences; tone is not guaranteed | [Personalization tests](../tests/personalization.test.mjs), [historical record](EVALUATION-LOG.md) |
| Current hosted code | Sites provenance and read-only health/IP diagnostics | Version/commit mapping and smoke-check scope recorded separately; v28 screenshots are historical | [Deployment record](DEPLOYMENT.md) |

## Reproduce automated checks

```bash
pnpm install --frozen-lockfile
pnpm check       # release boundaries, lint, types, offline tests, production build
pnpm audit       # full dependency audit; also enforced by CI
```

No production/model credentials are needed. CI pins action revisions, installs the lockfile, audits production and full dependency trees, and runs these checks without deployment credentials. A queued CI run is not a passing run.

Tests also cover PDF extraction, metadata/content separation and migration, citations, long-history summaries, voice draft/playback state, registration races, token settlement and dependency compatibility. SQLite validates SQL/transactions, not Cloudflare scheduling, D1 outages or Worker resource limits. Offline tests do not measure answer quality or real acoustics.

Local fixtures are `tests/fixtures/book-qa.tsx` and `voice-qa.tsx`. Expose them only in temporary local app routes and remove those before commit; release checks reject QA routes. Disposable registration/recovery drills, safety requirements and historical observations are in the [appendix](EVALUATION-LOG.md). Never point destructive drills at production.

## Manual release checklist

Record commit, browser/OS, fixture, actual result and evidence. Unexecuted items remain unverified.

- Migrations, admin bootstrap/login, ordinary-user access denial, account controls and existing-data preservation.
- Fresh text PDF, scanned-page OCR, reopening without re-embedding, citation-to-PDF navigation and unknown-page handling.
- Microphone permission denial, automatic submission/playback, interruption, empty recognition, mute/stop, retry, refresh and network/quota failures.
- Account A/B book/history/preference isolation, explicit feedback consent and independent sample copies.
- Keyboard focus, narrow/wide layouts, storage-full/unavailable errors and database outages.

Real OCR/provider calls require consent and a spending limit. General free-form keyboard entry, broad human/device testing, distributed load/soak tests and recovery SLAs remain open gates. Historical hardware tests used synthetic speech, not human speech; they were not rerun for every later revision.

## Planned quality benchmark — not measured results

Use consented/public books for 25 gold-page questions: eight direct facts, six paraphrases, four cross-chapter syntheses, three exact terms and four unanswerable questions. Compare dense-only, hybrid and hybrid-plus-diversity on identical inputs. Record model/version/date, connection, gold answers and reviewer judgments.

| Metric | Proposed target | Measurement |
| --- | ---: | --- |
| Passage recall@6 | ≥ 0.84 | At least one gold page among six passages |
| Citation precision | ≥ 0.90 | Human review of support for each claim |
| Groundedness | ≥ 4/5 | Rubric penalizing unsupported statements |
| Unanswerable accuracy | ≥ 0.75 | Appropriate acknowledgement of insufficient evidence |
| Voice completion | ≥ 0.90 | Transcription → answer → playback without recovery |
| Median answer latency | < 8 s | Submission to visible answer; report p95 too |

These targets are not results, SLAs or claims supported by the offline test count. See [historical experiments](EVALUATION-LOG.md) for dated observations, including failures, and [production gates](OPERATIONS.md#gates-before-unrestricted-production-access).
