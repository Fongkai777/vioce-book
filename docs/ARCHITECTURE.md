# Architecture and design decisions

## End-to-end flow

```text
PDF file
  -> PDF.js page extraction in the browser
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

## Why browser-side ingestion for the MVP

The source book never needs to be stored on the server, which gives the prototype a clear privacy story and removes upload-storage lifecycle work. Only passage text is sent to the embedding endpoint. The tradeoff is that indexing must restart after a refresh and large books consume browser memory.

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
- Upstream error messages are returned without exposing credentials.

## Failure behavior

- Image-only PDFs receive an explicit OCR limitation message.
- Microphone denial falls back to typed questions.
- Empty speech and empty model answers are reported rather than silently accepted.
- If TTS fails after an answer is generated, the textual answer remains visible.

