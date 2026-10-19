# Historical validation log

[中文](EVALUATION-LOG.zh-CN.md) · [Current evaluation summary](EVALUATION.md)

These are observations recorded on 19 October 2026. Version labels identify the code tested at that time, not the current deployment. Private raw outputs are not public evidence; the public-book report links its committed artifacts. No new acoustic test is implied by a later documentation or code release.

## Registration acceptance

Registration regression coverage includes: concurrent admission across distinct IPs, regular-only roles/default quotas/login, invalid/reserved/duplicate usernames, failed-write rollback, per-IP throttling/body bounds, Singapore-midnight rollover, deletion and backup-restore preservation of registration counters. These run against isolated SQLite, not production accounts; no real daily registration places are consumed. On 2026-10-19 the built Worker also passed all ten migrations in a fresh disposable Wrangler database. Chrome verified registration success and subsequent login as a regular reader with 20 questions / 10 voice minutes; five simultaneous HTTP registrations competing for the final place produced one 201 and four 429 responses, with zero places remaining. No live account was created.

## Local browser harnesses

`tests/fixtures/book-qa.tsx` and `voice-qa.tsx` use synthetic account data. Temporarily re-export one from a local-only app route, run the development server, exercise the UI, then remove the route. Never publish these routes. The voice fixture supplies synthetic audio; it does not need the real microphone or paid API calls. It cannot prove hardware accuracy.

The recorded book-management browser check covered default Overview, collapsed technical details, text fallback, passage search, citation navigation to list page 3, keyboard tab switching and incomplete-index warnings. On 2026-10-19, Chrome on macOS with the synthetic voice fixture verified direct automatic submission into a chat bubble with no preview/confirmation, stopping generation, speech interrupting pending replies, refresh recovery of all three stopped questions, answer failure, retry in the same message, automatic playback and reply-local playback stop. Earlier synthetic checks covered empty recognition and failed continuations. These are recorded manual observations, not unattended browser tests in CI. The temporary QA route was removed before the production build; no real microphone, account data or paid API was used.

## Real-device / release acceptance matrix

### Public twelve-chapter PDF acceptance

The [19 October acceptance report](acceptance/README.md) adds a reproducible public-domain PDF (12 complete story chapters / 56 pages), gold-page questions, live deployed microphone observations, source-to-PDF navigation and refresh recovery. Four synthetic-speaker → real-microphone questions produced three source-supported factual answers and one non-fabricating refusal; unnecessary refusal citations remain a quality issue. The screenshots/demo are public; reviewer credentials are not. This smoke set does not replace the proposed 25-question benchmark below.

### 2026-10-19 answer and acoustic smoke checks

With explicit owner consent, three books privately owned by the project author (not published) reused their saved `text-embedding-v4` vectors for nine questions (six answerable, three unsupported). Actual application routes used live approved providers with isolated SQLite auth/quota adapters; this is not deployed-browser E2E. Private excerpts/results remain in ignored local outputs, never in the public repository. This small hand-reviewed smoke set is not the gold-page benchmark below.

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

## 2026-10-20 live microphone run (v32) and retrieval fix

Chrome on macOS, deployed v32, fresh upload of the committed Alice PDF (SHA-256 matched; 148 passages in about 8.5 s). Seven questions were spoken by the macOS Samantha voice through the speakers into the real microphone. All seven transcripts auto-submitted; one changed "What" to "But" without changing the request. End of speech to first answer audio was about 17–20 s (transcription 4–6 s, retrieval 2 s, answer 5–10 s, first speech 3–5 s), well above the 8 s target.

| Question | Result |
| --- | --- |
| Bottle label (gold p. 4) | Correct, cited pp. 4–5 |
| Croquet balls and mallets (p. 33) | Correct, cited p. 33 |
| Cheshire Cat disappearing (p. 25) | **Wrong**: said only the head remained (a chapter VIII scene); p. 25 passage outranked by earlier topics |
| Follow-up: what Alice said (p. 25) | Correct referent and quotation |
| How the story ends (p. 52) | **Not answered**: no final-chapter passage retrieved; model declined rather than inventing |
| Teacher's name (unanswerable) | Correct refusal; still cited all six passages |
| Who is Bill (pp. 13–14) | Correct content, cited p. 14, but **answered in Chinese** to an English question |

Interrupting by voice while an answer was audibly playing through speakers was not detected; speaking before playback started did cancel it and submitted the new question. One reply stayed in "Preparing the spoken reply" for about a minute before that interruption; the cause was not isolated. The built-in desktop browser pane blocks microphone access, and the app showed its permission-denied message correctly.

Root causes found: the retrieval query concatenated the previous question and recalled earlier answers, dragging results back to old topics; the answer language was implicit; all-caps song lines ("CHORUS.") became section labels. Fix: retrieval uses the question alone unless it depends on the previous turn (pronouns, "and/why/what about", very short follow-ups, explicit turn references), the answer prompt states the reply language per turn, and books with explicit chapter headings use only those as sections. Replaying the same conversation offline with keyword ranking only, the follow-up and Bill questions moved from miss to hit and labels became the twelve chapter titles; the Cheshire Cat and ending questions still miss in keyword-only ranking, so the full hybrid result must be re-measured after deployment.
