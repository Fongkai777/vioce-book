# Feature and implementation details

[中文](FEATURES.zh-CN.md) · [Project overview](../README.md)

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` | required | Server-side API credential |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | API base URL |
| `OPENAI_QA_MODEL` | `gpt-5-mini` | Grounded answer model |
| `OPENAI_OCR_MODEL` | value of `OPENAI_QA_MODEL` | Scanned-page OCR model |
| `OPENAI_TRANSCRIBE_MODEL` | `gpt-4o-mini-transcribe` | Speech recognition |
| `OPENAI_TTS_MODEL` | `gpt-4o-mini-tts` | Speech generation |
| `OPENAI_TTS_VOICE` | `coral` | Synthesized voice |
| `ADMIN_USERNAME` | `admin` | Bootstrap administrator username |
| `ADMIN_PASSWORD` | required | Bootstrap administrator password; configure as a hosted secret |
| `COPILOT_EMBEDDING_API_KEY` | optional | Server-only credential for imported text-embedding-v4 query vectors |
| `COPILOT_EMBEDDING_BASE_URL` | `https://dashscope.aliyuncs.com/compatible-mode/v1` | Original imported-index embedding endpoint |

Secrets stay in `.env.local`, which is ignored by Git. The browser only calls the application's server routes. User passwords are PBKDF2-hashed before they are stored in D1, and sessions use HttpOnly cookies.

## Reader features

### Book management

The **Chat / Book management** tabs separate conversation from inspection. Book management supports searching/selecting local books, uploading PDFs, trying samples, removing an account's local copy (with confirmation), and opening its conversation without re-indexing.

- **Overview:** readiness, page/section/passage counts, source, account-local storage, saved date and extraction information. New PDF uploads record the PDF's author metadata when provided, OCR page count and included page count; legacy copies explicitly say when extraction information was not recorded. Empty, zero or malformed vectors do not count as ready. **Technical details** is collapsed by default and contains model, dimensions, validation and page-reference information, never raw vector arrays.
- **Content:** lazily reads the selected account's PDF blob, renders one page at a time with the same-origin PDF.js worker, and offers page navigation and zoom. Canvas rendering is cancelled/destroyed on navigation. No PDF or preview data is uploaded, and no model request is made. Samples and legacy imports without PDFs show saved text instead, progressively revealed for large books. **Show passages** switches to searchable saved passages, with section filters, 12-item pagination, known page ranges and links back to the PDF page.
- Citation drawers offer **View in book** to open Content and highlight the exact saved passage, including passages on later list pages. Missing citations and unknown page numbers are explicit. End voice mode before leaving the conversation. No existing books are reprocessed and no indexes are changed by inspection.
- Account-scoped file reads are independent of lightweight metadata lists and conversation index reads. Selecting another book discards stale asynchronous preview results; inspecting a book does not change the active conversation. Deletion still removes only that account's local copy and associated history.

### Cloud sample library

**Try a sample** on the start screen and **Browse sample books** in Local library offer two original, AI-authored English mini-books. They are examples, not excerpts of the owner's private books. Only these allowlisted texts and their prebuilt indexes ship in the server bundle; `local-library/`, uploaded PDFs, personal indexes and conversations do not.

- `GET /api/samples` requires the existing username/password session and returns lightweight metadata. `GET /api/samples?id=...` returns one allowlisted, read-only sample bundle; unknown IDs return 404. There is no upload or mutation API for the shared catalog.
- Selection copies the sample into this browser's account-scoped IndexedDB. Existing local copies are reopened without downloading, chunking or re-embedding. Atomic insert-only writes prevent repeated/concurrent selection from replacing the reader's copy.
- Book metadata, content/index, history and summary caches stay scoped by account and book. Removing one account's copy does not remove the shared template or another account's copy. This is browser-local logical isolation, not encrypted storage or cross-device synchronization; someone controlling the browser's developer tools can access its local storage.
- Opening a sample uses no AI API call and spends no question/indexing allowance. Asking questions still creates a query embedding and uses the ordinary answer/voice quotas. Model processing and explicitly submitted feedback follow the same rules as personal books.
- The small catalog is bundled with the hosted app, so it remains available when the developer's computer is off. It does not require an R2 bucket. Future large catalogs should use dedicated object storage.
- `node scripts/build-sample-index.mjs` is an explicit maintenance operation using the approved server-side credential. It generates `content/sample-index.json` once (12 passages / 2 books); an unchanged source hash skips API calls. It is never run by deployment or sample selection. Bump sample IDs when changing published content to preserve existing readers' copies.

This version deliberately keeps each uploaded PDF and its vector index in that browser's IndexedDB, scoped in the UI to the signed-in local account. Pages with little or no embedded text are rendered locally and sent individually to the OCR endpoint; ordinary text pages stay entirely in the browser until extracted passages are embedded. Clearing site data, switching browsers or devices, or using a private browsing session creates a separate library. Available browser storage, OCR time, and the daily indexing allowance remain practical limits. A larger production system could move parsing to a background job and synchronize files and indexes across devices.

### Hands-free voice conversation

Select a book and press **Start voice conversation** once. An AudioWorklet measures microphone input locally and displays its real level. Sustained speech starts a turn; approximately 1.1 seconds of silence ends it (or use **Done speaking**). A 450 ms pre-roll preserves the beginning; turns are capped at 58 seconds and sent as mono 16 kHz WAV to the existing authenticated transcription route.

The old combined microphone/text-input/send composer is removed. There is one explicit **Start voice conversation** button; the active voice card only contains microphone status, the level meter and capture controls. **Stop reply** lives beside the assistant's loading indicator and remains in the reply area during playback. Suggested questions remain available.

Recognized speech appears directly as a **You** message in the conversation, never in a separate transcription preview. When all queued transcription is finished and the user is no longer speaking, the message sends immediately, with no confirmation button or 1.8-second review timer. If the user continues speaking before transcription finishes, the same message accumulates the words. Transcription is turn-based, not live word-by-word streaming.

Draft lifecycle is independent of assistant cancellation: `VoiceDraft` owns the unsent words; the transcription queue and reply pipeline have separate abort signals. Empty/whitespace transcription is a no-op, not a fatal microphone error. Actual transcription failures, the input limit, editing, muting or ending voice hold incomplete words for review **inside their chat bubble**. Exceptional **Send question / Leave unsent** controls are available there; sending/editing is disabled while recording/transcription continues. Unsent words stay visible but are excluded from model context until explicitly sent.

Every recognized message has a stable ID. Submission changes that message to pending; completion, failure and interruption update it in place. Stopping a reply, speaking again, ending voice or a failed request never deletes the user question. Failed/stopped replies offer **Retry reply** without duplicating the question. With history enabled, recognized and pending messages are saved before an answer exists, and serialized history writes preserve their latest status. After reopening a book, unfinished requests show as stopped, unsent words remain unsent, and no paid request restarts automatically. Previously submitted but unanswered questions remain in context with an explicit no-answer note, not a fabricated assistant reply.

Answers retain the existing book retrieval, citations, preferences, history and quotas. Spoken output starts automatically, with a short first phrase and one prefetched remainder for longer answers. Speaking during playback interrupts it; **Stop reply** also cancels pending work. Abort signals and stale-result checks prevent cancelled replies/audio from resurfacing. Written answers stay available; interrupted playback is marked in history so the next response should not assume it was fully heard. **Play saved audio** replays the audio already downloaded, including partial output after interruption. Browser autoplay restrictions have an explicit manual fallback.

This adapts the turn-taking and interruption principles from [OpenAI's Realtime conversation guide](https://developers.openai.com/api/docs/guides/realtime-conversations) and [VAD guide](https://developers.openai.com/api/docs/guides/realtime-vad). It is **not** a native Realtime/WebRTC speech-to-speech connection: the current sequence remains transcription → RAG answer → speech generation, with corresponding network delays. Local energy-based detection is not semantic VAD. Browser echo cancellation and a more conservative playback threshold help, but background noise or loudspeaker echo may cause false interruptions; headphones are recommended.

The microphone starts only after the user requests voice mode. Mute disables its track; ending voice, leaving the tab, logging out, unmounting or 90 seconds without a new utterance stops capture. Audio before detected turns stays in memory locally; detected turns are sent to the configured provider through the server. No new provider/key or browser-exposed secret is introduced. Accepted requests still consume their normal quotas even when later interrupted; cancellation is not a billing refund. Single-turn transcription is limited to 2,000 displayed characters and TTS to 5,000 characters, matching the existing answer/speech input limits.

Validation includes offline tests and a browser-only synthetic-audio harness exercising the actual AudioWorklet, automatic submission into chat, autoplay, stopping generation/playback, speech interruption, refresh recovery and retry after answer failure without duplicating messages. State tests also cover consecutive utterance merging, empty-only recovery, failed continuations, unsent-message retention and account/book isolation. No real microphone or paid API was used in the harness. Hardware microphone quality and real-provider latency require a live user trial.

## Reference projects

The implementation is original, with design ideas informed by:

- [rag-over-pdf](https://github.com/sarmakska/rag-over-pdf): readable hybrid retrieval and citation UX.
- [docchat](https://github.com/AbuBaker91-hub/docchat): heading-aware chunks and retrieval evaluation.
- [LiveKit Agents examples](https://github.com/livekit/agents/tree/main/examples/voice_agents): voice interaction states and TTS-oriented responses.
- [RAGFlow](https://github.com/infiniflow/ragflow): document-aware parsing principles.
- [AnythingLLM](https://github.com/Mintplex-Labs/anything-llm): ingestion status and document workspace UX.

## Conversation history and context

- **Save each book's conversations on this device** is enabled by default; an explicit opt-out remains respected. It stores all turns and their original sources in IndexedDB, isolated by account and book. There is no application-imposed turn-count retention limit. Browser disk limits/clearing still apply; this is not cross-device cloud backup.
- Existing localStorage history migrates on book selection. The old copy is removed only after the new transaction commits. Previously discarded turns cannot be reconstructed.
- Short conversations send every prior question/answer, excluding stale citation markers. The current conservative history envelope is 240,000 UTF-8 bytes, independent of turn count. This is an application budget, not an exact tokenizer count or the model's advertised context size. It reserves space for book evidence, instructions and output with the current `gpt-5-mini`; review the budget before switching to a smaller-context model. See the [official model context limits](https://developers.openai.com/api/docs/models/gpt-5-mini).
- Above that budget, the browser keeps a recent verbatim window, summarizes **all** earlier text in blocks, recursively combines summaries if needed, and retrieves relevant older original passages with Chinese/English keyword matching and explicit turn references. Retrieval is best effort, not a guarantee of perfect recall.
- Summaries are content-addressed and cached per book. Original chat is never replaced by a summary. Partial completed summary work survives retries; failure is shown rather than silently dropping earlier context. A first long-history summary may take longer.
- `/api/history/summary` requires login, enforces input/output limits and a separate 500,000-character daily maintenance allowance (minimum 1,000 per request), and does not consume a question. Summary/answer requests use `store: false`; the app does not persist chat in D1. Model-provider processing still occurs.
- Deleting a book or clearing history deletes its stored conversations and summary cache; disabling history clears this account's stored history on the current browser while retaining the active in-memory conversation. Explicit personal preferences remain separate.
- Regression checks: `node --experimental-strip-types --test tests/*.test.mjs`, `node scripts/check-reader-feedback.mjs --with-history-model` against local preview after applying migrations. The latter uses ephemeral local accounts and live API calls with synthetic dialogue only.
