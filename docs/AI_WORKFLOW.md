# AI-assisted workflow

## Process

1. Extracted the assignment into explicit acceptance criteria: voice input, RAG grounding, spoken output, retrieval quality, polished UI, documentation, and testing.
2. Reviewed several open-source projects by responsibility rather than adopting one codebase wholesale.
3. Selected a minimal architecture with visible provenance and deterministic retrieval code that can be tested independently of model calls.
4. Used AI assistance to draft implementation slices, then verified them with unit tests, type checks, production builds, browser inspection, and live API smoke tests.
5. Recorded limitations instead of hiding them and separated MVP choices from production recommendations.

## Critical judgments

- Rejected dense-only fixed-size chunking because the assignment explicitly calls out its recall limitations.
- Kept citation metadata outside model control; page ranges come from parsing, not generation.
- Chose reciprocal-rank fusion because dense and BM25 scores are not naturally comparable.
- Preserved typed input alongside voice for accessibility and repeatable testing.
- Kept uploaded files session-local for this prototype and documented the scalability tradeoff.

## Prompt contract

The answer model receives only retrieved passages, is instructed to use the reader's language, and must cite evidence labels. It must decline when excerpts are insufficient. Answers are kept short and free of tables so TTS output remains natural.

## Review protocol

AI-generated code is accepted only after:

- deterministic logic has focused tests;
- secrets and upload boundaries are reviewed;
- API payloads match current official documentation;
- the production bundle succeeds;
- user-visible loading, error, empty, and permission-denied states are exercised.

