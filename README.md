# Voicebook

Voicebook is a voice-first PDF reading companion built for the Wiz AI Builder Intern take-home assignment. Upload a long PDF, ask a question through the microphone, and hear a concise answer grounded in cited passages from the book.

## Highlights

- Browser-side PDF parsing with page provenance and OCR fallback for scanned pages; the original PDF is never stored on the app server.
- A multi-book local library backed by IndexedDB, including each PDF, its chunks, and its embeddings.
- Instant switching between previously indexed books without repeating parsing or embedding calls.
- Heading-aware section detection and overlapping structural chunks.
- Hybrid retrieval: OpenAI embeddings + BM25 exact-match recall.
- Reciprocal-rank fusion and diversity-aware final evidence selection.
- Page-level source cards and a full passage drawer.
- Microphone capture, OpenAI transcription, grounded answer generation, and AI voice playback.
- Typed questions remain available for accessibility and testing.
- Per-user daily question and voice allowances backed by D1.
- An administrator dashboard for reviewing usage and adjusting individual limits.
- Unit tests for heading detection, provenance, BM25, and hybrid retrieval.

## Run locally

Requirements: Node.js 22.13+ and an OpenAI API key.

```bash
cp .env.example .env.local
# Add OPENAI_API_KEY to .env.local
pnpm install
pnpm dev
```

Open the local URL printed by the development server. Microphone access works on localhost or HTTPS.

## Environment

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

Secrets stay in `.env.local`, which is ignored by Git. The browser only calls the application's server routes. User passwords are PBKDF2-hashed before they are stored in D1, and sessions use HttpOnly cookies.

## Commands

```bash
pnpm test      # retrieval unit tests
pnpm lint      # code quality
pnpm build     # production build
pnpm dev       # local development
```

After generating a schema migration with `pnpm db:generate`, apply it to local D1 before running the built Worker preview. Hosted Sites deployments apply committed migrations automatically.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Testing and answer-quality evaluation](docs/EVALUATION.md)
- [AI-assisted workflow](docs/AI_WORKFLOW.md)

## Scope and next steps

This version deliberately keeps each uploaded PDF and its vector index in that browser's IndexedDB, scoped in the UI to the signed-in local account. Pages with little or no embedded text are rendered locally and sent individually to the OCR endpoint; ordinary text pages stay entirely in the browser until extracted passages are embedded. Clearing site data, switching browsers or devices, or using a private browsing session creates a separate library. Available browser storage, OCR time, and the daily indexing allowance remain practical limits. A larger production system could move parsing to a background job and synchronize files and indexes across devices.

## Reference projects

The implementation is original, with design ideas informed by:

- [rag-over-pdf](https://github.com/sarmakska/rag-over-pdf): readable hybrid retrieval and citation UX.
- [docchat](https://github.com/AbuBaker91-hub/docchat): heading-aware chunks and retrieval evaluation.
- [LiveKit Agents examples](https://github.com/livekit/agents/tree/main/examples/voice_agents): voice interaction states and TTS-oriented responses.
- [RAGFlow](https://github.com/infiniflow/ragflow): document-aware parsing principles.
- [AnythingLLM](https://github.com/Mintplex-Labs/anything-llm): ingestion status and document workspace UX.

