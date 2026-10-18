# Architecture and design decisions

## End-to-end flow

```text
PDF file
  -> PDF.js page extraction in the browser
  -> scanned/empty page -> local page rendering -> /api/ocr -> vision OCR
  -> heading-aware section builder
  -> overlapping child passages with page metadata
  -> /api/embed -> text-embedding-3-small
  -> session-local passage index

Microphone
  -> MediaRecorder WebM/M4A
  -> /api/transcribe -> gpt-4o-mini-transcribe
  -> query embedding
  -> dense ranking + BM25 ranking
  -> reciprocal-rank fusion
  -> diversity-aware top passages
  -> /api/answer -> grounded response with [S#] citations
  -> /api/speech -> gpt-4o-mini-tts
  -> browser audio playback
```

Every API route validates the site's HttpOnly login session before calling OpenAI. D1 stores local accounts, hashed passwords, sessions, Singapore-calendar-day counters, and administrator quota overrides. The answer and transcription routes atomically increment usage only while the new value remains within the limit, so simultaneous requests cannot overspend the same allowance.

## Why browser-side ingestion for the MVP

The source book never needs to be stored on the server, which gives the prototype a clear privacy story and removes upload-storage lifecycle work. Only passage text is sent to the embedding endpoint for normal text PDFs. When a page has little or no embedded text, that page is rendered to a bounded JPEG in the browser and sent to the authenticated OCR endpoint. The tradeoff is that indexing must restart after a refresh and large books consume browser memory.

For production, ingestion should become an asynchronous server job backed by object storage and a persistent vector database. Status events can stream to the client while parsing and embedding continue.

## Retrieval strategy

### Structure before size

Pages are converted to lines, and likely chapter/part/section headings start new logical sections. Passages are formed within those sections with a small overlap. Each passage retains its section title and page range.

This is preferable to slicing the entire book every N characters because headings provide semantic boundaries and useful citation labels. It is still deterministic and inexpensive enough for client-side indexing.

### Hybrid recall

Dense similarity helps when the question paraphrases the book. BM25 helps exact names, codes, quotations, and rare terminology. Each ranking is fused with reciprocal-rank fusion, so neither score needs brittle manual normalization.

### Diversity selection

The highest fused candidates are filtered with a lexical redundancy penalty. This prevents the final context window from being filled with near-identical overlapping passages.

### Grounding contract

The answer prompt labels evidence `[S1]`, `[S2]`, and so on. The model must answer only from those excerpts, cite factual claims, and state when the evidence is insufficient. Citation cards are generated from the actual retrieved passages rather than model-produced page metadata.

## Security and privacy

- The OpenAI API key is server-only.
- `.env.local`, generated data, and build artifacts are ignored by Git.
- Uploaded PDF bytes remain in the browser session.
- API inputs are bounded by passage count and length.
- Every OpenAI-backed route requires an authenticated local account.
- Daily question and voice limits are enforced in D1; indexing and speech also have fixed abuse ceilings.
- The bootstrap administrator credential is supplied through hosted environment variables and never committed.
- Administrators can create reviewer accounts; passwords are PBKDF2-hashed with per-user salts.
- Upstream error messages are returned without exposing credentials.

## Failure behavior

- Image-only pages fall back to OCR; unreadable pages are skipped, and a clear error is shown if the document remains empty.
- Microphone denial falls back to typed questions.
- Empty speech and empty model answers are reported rather than silently accepted.
- If TTS fails after an answer is generated, the textual answer remains visible.

