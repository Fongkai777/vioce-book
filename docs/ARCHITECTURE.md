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
  -> AudioWorklet speech detection -> mono 16 kHz PCM WAV
  -> /api/transcribe -> gpt-4o-mini-transcribe
  -> query embedding
  -> dense ranking + BM25 ranking
  -> reciprocal-rank fusion
  -> diversity-aware top passages
  -> /api/answer -> grounded response with [S#] citations
  -> /api/speech -> gpt-4o-mini-tts
  -> browser audio playback
```

Every model-backed API route validates the site's HttpOnly login session before calling OpenAI. D1 stores local accounts, hashed passwords, sessions, Singapore-calendar-day counters, and administrator quota overrides. The answer and transcription routes atomically increment usage only while the new value remains within the limit, so simultaneous requests cannot overspend the same allowance.

`lib/operations.ts` wraps all six paid API paths with authentication, byte-bounded request parsing, metadata-only metrics and a shared provider adapter. The adapter reserves estimated USD micros in D1 and acquires a global/per-user lease in the same transaction before fetching. It retains the lease through bounded body consumption and releases it in `finally`. Known-model successful responses with validated token usage reconcile the reserve atomically and idempotently against the original day; missing usage and failures retain estimates. `operations_costs` holds only model/policy/token/cost metadata. The control plane owns daily budget, enable/pause and concurrency; missing schema fails closed. See [pricing policy](PRICING.md); this is not a provider invoice or an edge WAF.

`lib/server-backup.ts` takes consistent D1 batch snapshots of allowlisted application tables. AES-GCM envelopes are created/decrypted with `lib/backup-crypto.ts`; session tokens and provider credentials are excluded. Password-reauthenticated restore replaces application data in one transaction while preserving control-plane state and nondecreasing global usage. Browser book backups use the same envelope but never leave the device; ownership validation, insert-only books and atomic append-only history restore preserve current data. Server and browser backups are separate, manual workflows. See [Backup and recovery](BACKUP-RESTORE.md).

## Why browser-side ingestion for the MVP

The source book never needs to be stored on the server, which gives the prototype a clear privacy story and removes upload-storage lifecycle work. Each PDF, its structural chunks, and its embedding vectors are stored in IndexedDB under the signed-in local account identifier. Selecting an existing book restores that index without parsing or embedding again. Only passage text is sent to the embedding endpoint for normal text PDFs. When a page has little or no embedded text, that page is rendered to a bounded JPEG in the browser and sent to the authenticated OCR endpoint. The tradeoff is that libraries are browser-local rather than synchronized across devices, and large collections consume browser storage.

For a future synchronized product, ingestion can become an asynchronous server job backed by tenant-scoped object storage and a vector database. This is not implemented; see OPERATIONS.md for release gates. Browser-local storage remains a deliberate choice for the current demo.

### Local library schema and migration

IndexedDB schema v2 uses `books` for metadata (owner, book ID, title, counts, model, dimensions, timestamps), `book-content` for text and vectors, and `book-files` for optional PDF blobs. Lists read only `books`. Selecting a book reads its metadata and content but not the PDF; updating its last-opened time changes only the metadata row. The v1 upgrade streams each old record through a cursor in a single upgrade transaction, so a failure rolls back the upgrade. All three stores use the same owner-scoped key and are deleted atomically for a removed book.

Previously migrated Copilot libraries used a versioned local JSON import; the public import UI is now removed, while maintenance validation/export code remains. The importer validates model, dimension, IDs and finite vector values before saving. Copilot book queries use `text-embedding-v4` at 1024 dimensions via a server-side credential; ordinary uploaded PDFs use OpenAI `text-embedding-3-small` at 1536 dimensions. The API permits only these models and limits the Copilot path to one query per request. Neither raw imported books nor their indexes are sent to an API during import. Only question text goes to the embedding provider and retrieved excerpts go to the answer provider during a conversation.

Question search is metered separately from book indexing, so exhausting OCR/indexing allowance does not block cached books. A query is limited to 2,000 characters, requires remaining daily questions, and atomically consumes one query-search allowance. Search calls are capped at twice the user's configured question limit to allow retries; completed answer requests still consume the original question allowance.

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
- Uploaded PDFs persist in account-scoped IndexedDB, not just the current session. This is logical isolation, not encryption against someone controlling that browser.
- API inputs are bounded by passage count and length.
- Every OpenAI-backed route requires an authenticated local account.
- Daily question and voice limits are enforced in D1; indexing and speech also have fixed abuse ceilings.
- The bootstrap administrator credential is supplied through hosted environment variables and never committed.
- Administrators can create reviewer accounts; passwords are PBKDF2-hashed with per-user salts.
- Cross-origin browser mutations are rejected before body parsing. API errors expose only intentional public messages; unknown exceptions and provider response bodies are not echoed.
- Preferences and explicitly submitted answer feedback are stored in D1. Feedback includes question/answer text and is visible to administrators; it is not the same as automatic chat-history synchronization.
- Login uses PBKDF2-SHA256 (100,000 iterations, runtime-compatible), random salts and hashed 256-bit session tokens. HTTPS cookies are HttpOnly, Secure, SameSite=Lax and expire after seven days. See SECURITY.md for limitations.

## Failure behavior

- Image-only pages fall back to OCR; unreadable pages are skipped, and a clear error is shown if the document remains empty.
- Microphone denial shows an error; suggested questions remain available. The general text composer has been removed; transcript editing is available after recognition.
- Empty speech preserves any existing unsent transcript; actual transcription failures hold it for explicit review. Empty model answers report a failure.
- Accepted model requests consume their quota even if the provider later fails or the client interrupts.
- If TTS fails after an answer is generated, the textual answer remains visible.

