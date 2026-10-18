# Testing and answer-quality evaluation

## Automated release checks

`pnpm check` runs secret/private-file boundaries, `tsc --noEmit`, Node's test runner and a Worker/client build. The initial GitHub release has **60 tests**, including a synthetic two-page PDF extraction regression; the current runner output is authoritative as more tests are added. CI is defined in `.github/workflows/ci.yml`, pins action revisions, audits production dependencies, installs the locked dependencies and receives no production/model secrets.

| Area | Automated evidence |
| --- | --- |
| Retrieval | Heading detection, page/section provenance, BM25 and hybrid ranking |
| Local books | v1→v2 atomic migration, metadata-only reads, lazy PDF loading, preserved imported vectors, account isolation |
| Book manager | Two tabs, overview readiness, unknown legacy metadata, source-aware sample/private copies, citation pagination |
| History | More than 20 turns, concurrent saves, account/book scoped clearing, legacy migration, full/compressed context and summary cache/failure |
| Voice | Energy detection, pre-roll, silence, bounded utterances, WAV encoding, playback interruption, cancellation, transcript merging, empty/error continuation and review controls |
| Server | Actual auth/quota/route modules using in-memory SQLite and all committed D1 SQL migrations; host cookie/env adapters only are replaced |
| Server security | Salted hashes, hashed/expired/revoked sessions, login throttle, concurrent bootstrap, regular-user admin denial, cross-origin mutation rejection, authentication gates, quota concurrency/bounds and error sanitization |
| Account data | Preferences/feedback cannot target a submitted foreign user ID; samples are authenticated/allowlisted and cost no quota to open |

The server harness throws on any external `fetch`. Its database is `:memory:` and does not access `.wrangler` or production. SQLite validates SQL and constraint behavior, but it does not reproduce Cloudflare network scheduling, Worker resource limits or D1 availability. The quota test issues overlapping calls and verifies the conditional UPDATE never exceeds its limit; it is not a distributed load test.

## Local browser harnesses

`tests/fixtures/book-qa.tsx` and `voice-qa.tsx` use synthetic account data. Temporarily re-export one from a local-only app route, run the development server, exercise the UI, then remove the route. Never publish these routes. The voice fixture supplies synthetic audio; it does not need the real microphone or paid API calls. It cannot prove hardware accuracy.

The latest book-management browser check covered default Overview, collapsed technical details, text fallback, passage search, citation navigation to list page 3, keyboard tab switching and incomplete-index warnings. Earlier synthetic voice checks covered draft preservation after empty recognition, editing, playback and cancellation. These are recorded manual observations, not unattended browser tests in CI.

## Real-device / release acceptance matrix

Record browser/OS, fixture, commit, observed outcome and evidence for each check; do not mark a case passed without running it.

- New database: migrations, admin bootstrap, regular account login, 401 logged out and 403 for ordinary users on admin routes.
- Existing database: migrations preserve accounts/overrides/preferences; existing local books remain usable with no re-embedding.
- Text PDF: ingest once; reopen locally; preview pages and source-linked passages.
- Scanned PDF: page OCR produces readable text; no-text pages and provider failures have clear outcomes. This uses real paid OCR only with permission.
- Voice: permission denied, valid turn, valid-then-empty continuation, manual edit/send, interruption during playback, stop/mute, background tab, network failure and exhausted quota.
- References: citation text supports the answer, page links are accurate when available and missing pages are not invented.
- Privacy: user A/B library/history/preferences isolation; shared sample copies remain independent; feedback is submitted only deliberately.
- Accessibility/layout: keyboard focus, narrow/wide layouts, readable status indicators and non-voice access. General free-form keyboard entry is a known missing path.
- Error paths: malformed requests, provider failure, stale/cancelled responses, storage unavailable/full and database outage.

## Answer quality and performance: targets, not measured results

Build a consented/public test book dataset of 25 questions: 8 direct facts, 6 paraphrases, 4 cross-chapter synthesis, 3 exact terms/names and 4 unanswerable questions. Record gold pages and short answers. Compare dense-only, hybrid and hybrid-plus-diversity on identical inputs. Include provider/model/version/date and test connection.

| Metric | Proposed target | Measurement |
| --- | ---: | --- |
| Passage recall@6 | ≥ 0.84 | At least one gold page in six passages |
| Citation precision | ≥ 0.90 | Human checks cited text supports the claim |
| Groundedness | ≥ 4/5 | Human rubric penalizing unsupported statements |
| Unanswerable accuracy | ≥ 0.75 | Correct acknowledgement of insufficient evidence |
| Voice completion | ≥ 0.90 | Transcript → answer → playback without recovery |
| Median answer latency | < 8 seconds | Query submission to visible answer; report p95 too |

No results for this dataset, hardware microphone accuracy, production load, uptime or provider latency are claimed by the offline tests. Those remain release gates for wider production use.
