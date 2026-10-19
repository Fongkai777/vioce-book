# Testing and answer-quality evaluation

## Automated release checks

Self-registration adds seven regression tests (109 total): concurrent admission across distinct IPs, regular-only roles/default quotas/login, invalid/reserved/duplicate usernames, failed-write rollback, per-IP throttling/body bounds, Singapore-midnight rollover, deletion and backup-restore preservation of registration counters. These run against isolated SQLite, not production accounts; no real daily registration places are consumed. On 2026-10-19 the built Worker also passed all ten migrations in a fresh disposable Wrangler database. Chrome verified registration success and subsequent login as a regular reader with 20 questions / 10 voice minutes; five simultaneous HTTP registrations competing for the final place produced one 201 and four 429 responses, with zero places remaining. No live account was created.

`pnpm check` runs secret/private-file boundaries, `tsc --noEmit`, Node's test runner and a Worker/client build. The current suite has **125 tests**, including citation normalization, answer capability/verbosity contracts, empty-transcript gating, resumable output audio, explicit one-sentence overrides, self-registration admission, PDF extraction, token settlement and admin-only legacy correction; the runner output is authoritative as more tests are added. CI is defined in `.github/workflows/ci.yml`, pins action revisions, audits the full dependency tree without advisory exceptions, installs the locked dependencies and receives no production/model secrets.

| Area | Automated evidence |
| --- | --- |
| Retrieval | Heading detection, page/section provenance, BM25 and hybrid ranking |
| Local books | v1→v2 atomic migration, metadata-only reads, lazy PDF loading, preserved imported vectors, account isolation |
| Book manager | Two tabs, overview readiness, unknown legacy metadata, source-aware sample/private copies, citation pagination |
| History | More than 20 turns, concurrent saves, account/book scoped clearing, legacy migration, full/compressed context and summary cache/failure |
| Voice | Energy detection, pre-roll, silence, bounded utterances, WAV encoding, playback interruption, cancellation, stable speech-message IDs, transcript merging, retained failed/stopped/unsent messages, in-chat recovery and reply-local stop controls |
| Server | Actual auth/quota/route modules using in-memory SQLite and all committed D1 SQL migrations; host cookie/env adapters only are replaced |
| Server security | Salted hashes, hashed/expired/revoked sessions, login throttle, concurrent bootstrap, regular-user admin denial, cross-origin mutation rejection, authentication gates, quota concurrency/bounds and error sanitization |
| Account data | Preferences/feedback cannot target a submitted foreign user ID; samples are authenticated/allowlisted and cost no quota to open |
| Operations | Concurrent cross-account global budget, per-user/global leases, pause, expiry/day rollover, no refunds, admin-only settings, bounded request bodies and readiness failure |
| Recovery | Authenticated encryption, wrong passphrase/tampering rejection, server snapshot/restore, role/origin/reauthentication guards, transaction rollback, session revocation and spend preservation; browser PDF/vector/history roundtrip and cross-account rejection |
| Dependency mitigation | Real ESLint/Vinext dependency copies reject deeply nested/unbalanced strings, deep direct ASTs and cycles while ordinary expansion still works |

The server harness throws on external `fetch` by default; the provider-wrapper regression replaces it with synthetic responses/errors without networking. Its database is `:memory:` and does not access `.wrangler` or production. SQLite validates SQL and constraint behavior, but it does not reproduce Cloudflare network scheduling, Worker resource limits or D1 availability. Quota/budget tests issue overlapping calls and verify atomic updates never exceed limits; they are not distributed load tests. Recovery tests never replace real production data.

## Local browser harnesses

`tests/fixtures/book-qa.tsx` and `voice-qa.tsx` use synthetic account data. Temporarily re-export one from a local-only app route, run the development server, exercise the UI, then remove the route. Never publish these routes. The voice fixture supplies synthetic audio; it does not need the real microphone or paid API calls. It cannot prove hardware accuracy.

The latest book-management browser check covered default Overview, collapsed technical details, text fallback, passage search, citation navigation to list page 3, keyboard tab switching and incomplete-index warnings. On 2026-10-19, Chrome on macOS with the synthetic voice fixture verified direct automatic submission into a chat bubble with no preview/confirmation, stopping generation, speech interrupting pending replies, refresh recovery of all three stopped questions, answer failure, retry in the same message, automatic playback and reply-local playback stop. Earlier synthetic checks covered empty recognition and failed continuations. These are recorded manual observations, not unattended browser tests in CI. The temporary QA route was removed before the production build; no real microphone, account data or paid API was used.

## Real-device / release acceptance matrix

### 2026-10-19 answer and acoustic smoke checks

With explicit owner consent, three private local books (人类简史, 亲密关系, 幸福之路) reused their saved `text-embedding-v4` vectors for nine questions (six answerable, three unsupported). Actual application routes used live approved providers with isolated SQLite auth/quota adapters; this is not deployed-browser E2E. Private excerpts/results remain in ignored local outputs, never in the public repository. This small hand-reviewed smoke set is not the gold-page benchmark below.

Using GPT-5 mini with the new voice-sized prompt and `text.verbosity: low`, the same nine questions averaged 136 characters including citation markers, versus 417 before. Median query-to-answer time was 10.36 s versus 11.37 s (not an SLA). All three unsupported questions declined to provide the requested fact and none offered web browsing; some still used unnecessary citations or overbroad absence wording, so citation normalization does not establish semantic groundedness. Canonical source references are enforced separately from this quality limitation.

For the same 6.10 s synthetic Mandarin recording, real ASR returned the expected question; the saved-answer TTS duration dropped from 79.46 s to 36.96 s. ASR took 1.52 s, embedding/retrieval/answer 7.29 s and one whole-answer TTS call 5.26 s. These are route-level timings, not browser time-to-first-audio. The isolated rerun accounted for approximately US$0.0785 (US$0.0368 token-settled plus US$0.0417 estimates); production budget and accounts were not changed.

An explicitly authorized macOS Chrome / deployed v26 speaker-to-microphone check then revealed a real issue. The owner confirmed audio came from the computer speakers. Two attempts did not produce valid words; a third showed an input meter at 42/100 and accurately transcribed the full question into chat. A subsequent empty sound cancelled the pending reply. Microphone capture was ended after each test. This does not prove echo cancellation or human barge-in reliability.

The fix separates input activity from reply generation: VAD alone no longer cancels an unplayed response; confirmed words do. Playback waits until input/transcription finishes. Audible playback still stops immediately on sustained speech detection. A local browser fixture verified an empty follow-up during an 8-second answer leaves the original answer intact and completes playback; a subsequent synthetic utterance interrupted playback, preserved full text and submitted the next question. The fixture uses synthetic audio and mocked providers, not real microphone acoustics. Offline tests also cover cancelled and back-to-back playback gates. Ending voice clears stale “still listening” notices.

The verbosity parameter follows [OpenAI's GPT-5 parameters guide](https://developers.openai.com/cookbook/examples/gpt-5/gpt-5_new_params_and_tools). It is enabled only for the verified GPT-5 family; custom models retain their existing request shape. Detailed reader preference remains available.

### Extended eight-turn acoustic session and acceptance checks

On deployed v27 (`008cbc8`), an authorized Chrome/macOS speaker→real-microphone session ran from 15:58:39 to 16:08:44 Singapore time, using eight related synthetic Mandarin questions about the same saved book. All eight transcriptions auto-submitted and produced written answers. Seven turns were directly observed in the playback state; turn seven showed an audio-interruption marker. Turns three, four and five interrupted earlier playback while preserving text; turn six correctly recalled a scenario mentioned in turn four. This verifies a particular synthetic acoustic setup, not human speech or universal device reliability. The microphone was explicitly ended afterwards, and the eight test turns remain in the owner's local history.

Two important failures were retained in the private record: turn seven's playback stopped after empty recognition without a new test utterance (ambient sound vs. residual echo not isolated), and turn eight misrecognized a phrase, changing the intended meaning. The owner account used eight questions and 114 billed input seconds including incidental segments; limits were not reset. No assistant reply was observed to become an unintended new user message, but this sample cannot establish an echo-error rate. Full browser observations, synthetic inputs, transcripts and screenshots are in ignored local outputs and are not published.

The follow-up fix makes VAD pause only the audio output source, not the microphone's shared AudioContext. Empty recognition resumes the saved buffer from its accumulated playback offset, without another TTS request. Confirmed words cancel the old answer and submit a new turn. Tests cover repeated pause/resume, offsets, abort while paused, stale resume and browser suspension; the local browser fixture exercised empty sound during playback (continued/completed without an interrupted marker or extra synthesis) and a subsequent valid interruption (old text retained, new answer played). This remains separate from post-deployment acoustic verification.

Current-turn one-sentence requests now temporarily override detailed/custom-example defaults without changing saved preferences. Explicit custom delivery ordering takes priority over presets. A live-provider comparison using identical frozen real excerpts verified brief vs. detailed, an analogy before the conclusion, feedback-driven one-sentence rewriting, and one-sentence overriding the detailed preset. These were actual answer routes with isolated SQLite auth/preferences and approved credentials. They are small stochastic spot checks, not guarantees: response tone, strict lengths, source support and occasional mixed-language wording still require evaluation.

A separate production Worker build ran against a new disposable local D1 database with all ten migrations. Browser acceptance covered public registration, subsequent sign-in as a regular account (20 questions / 10 input minutes), choosing a pre-indexed sample, preference persistence after refresh, feedback submission, one-quota rewrite and explicitly appending a suggestion to preferences. Ratings did not silently change preferences. Account A's two saved turns survived refresh; account B started with no A books/history/preferences, and disabling history before B's first turn prevented that turn from being restored while preserving the book/index. The browser used a loopback synthetic provider; live answer quality was tested separately above. No real user data was cleared.

`scripts/check-registration.mjs` then verified the UI-created account, permissions, a final-slot race (one 201 / four 429), exhausted registration, persistence across login, cross-account preference isolation, idempotent feedback, administrator feedback visibility and separate administrator-created accounts. It refuses to run without `VOICEBOOK_QA_DISPOSABLE=1` and an HTTP loopback target. To reproduce: create a fresh `mktemp -d` directory, apply `wrangler.local.jsonc` migrations there, build, start `tests/fixtures/acceptance-provider.mjs`, run the built Worker on 8876 with that directory and synthetic admin credentials (`acceptance-admin` / `synthetic-acceptance-password`), a synthetic model key and `OPENAI_BASE_URL=http://127.0.0.1:8877/v1`. Register `acceptance-reader` / `synthetic-reader-password` through the UI, then run the script. All fixture credentials are non-production; never point the script at real data.

The public production registration endpoint was checked read-only and still reported **2/2 places available on 2026-10-19**. No production registration place was consumed by these acceptance tests. This is an observation at test time, not a promise that later visitors cannot fill the daily cap.

Operations validation on 2026-10-19 additionally used the built Worker in local Wrangler with a new temporary D1 directory and synthetic credentials: all seven migrations applied; admin login and readiness succeeded; US$5 default displayed; encrypted export, wrong-passphrase rejection, restore, session revocation, recovered-account login and explicit resume passed. The responsive administrator panel was inspected in the browser. `scripts/check-operations.mjs` reproduces the destructive **test-database-only** drill, requiring `VOICEBOOK_QA_DISPOSABLE=1` and an HTTP loopback target; it must never be pointed at user data. No production records or real model calls were involved.

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
