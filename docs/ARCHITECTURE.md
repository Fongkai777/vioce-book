# Architecture and design decisions

## End-to-end flow

```text
PDF file
  -> PDF.js page extraction in the browser
  -> scanned/empty page -> local page rendering -> /api/ocr -> vision OCR
  -> heading-aware section builder
  -> overlapping child passages with page metadata
  -> /api/embed -> text-embedding-3-small
  -> IndexedDB local library (PDF + passage index)

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

The source book never needs to be stored on the server, which gives the prototype a clear privacy story and removes upload-storage lifecycle work. Each PDF, its structural chunks, and its embedding vectors are stored in IndexedDB under the signed-in local account identifier. Selecting an existing book restores that index without parsing or embedding again. Only passage text is sent to the embedding endpoint for normal text PDFs. When a page has little or no embedded text, that page is rendered to a bounded JPEG in the browser and sent to the authenticated OCR endpoint. The tradeoff is that libraries are browser-local rather than synchronized across devices, and large collections consume browser storage.

For production, ingestion should become an asynchronous server job backed by object storage and a persistent vector database. Status events can stream to the client while parsing and embedding continue.

### Local library schema and migration

IndexedDB schema v2 uses `books` for metadata (owner, book ID, title, counts, model, dimensions, timestamps), `book-content` for text and vectors, and `book-files` for optional PDF blobs. Lists read only `books`. Selecting a book reads its metadata and content but not the PDF; updating its last-opened time changes only the metadata row. The v1 upgrade streams each old record through a cursor in a single upgrade transaction, so a failure rolls back the upgrade. All three stores use the same owner-scoped key and are deleted atomically for a removed book.

Existing Copilot libraries enter through a versioned local JSON import. The importer validates model, dimension, IDs and finite vector values before saving. Copilot book queries use `text-embedding-v4` at 1024 dimensions via a server-side credential; ordinary uploaded PDFs use OpenAI `text-embedding-3-small` at 1536 dimensions. The API permits only these models and limits the Copilot path to one query per request. Neither raw imported books nor their indexes are sent to an API during import. Only question text goes to the embedding provider and retrieved excerpts go to the answer provider during a conversation.

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
- PDFs, chunks, and embeddings are stored in browser IndexedDB and are never written to server storage.
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

