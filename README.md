# Voicebook

Voicebook is a voice-first PDF reading companion built for the Wiz AI Builder Intern take-home assignment. Upload a long PDF, ask a question through the microphone, and hear a concise answer grounded in cited passages from the book.

## Highlights

- Browser-side PDF parsing with page provenance; the uploaded file is not persisted.
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
| `OPENAI_TRANSCRIBE_MODEL` | `gpt-4o-mini-transcribe` | Speech recognition |
| `OPENAI_TTS_MODEL` | `gpt-4o-mini-tts` | Speech generation |
| `OPENAI_TTS_VOICE` | `coral` | Synthesized voice |
| `ADMIN_EMAILS` | required for admin UI | Comma-separated emails allowed to manage user quotas |

Secrets stay in `.env.local`, which is ignored by Git. The browser only calls the application's server routes.

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

This first version deliberately keeps the uploaded PDF and its vector index in the browser session. It imposes no application-level file-size cap, but available browser memory remains a practical limit. A production version would move parsing to a background job, store files in object storage, persist indexes per user, and add OCR for scanned books.

## Reference projects

The implementation is original, with design ideas informed by:

- [rag-over-pdf](https://github.com/sarmakska/rag-over-pdf): readable hybrid retrieval and citation UX.
- [docchat](https://github.com/AbuBaker91-hub/docchat): heading-aware chunks and retrieval evaluation.
- [LiveKit Agents examples](https://github.com/livekit/agents/tree/main/examples/voice_agents): voice interaction states and TTS-oriented responses.
- [RAGFlow](https://github.com/infiniflow/ragflow): document-aware parsing principles.
- [AnythingLLM](https://github.com/Mintplex-Labs/anything-llm): ingestion status and document workspace UX.

