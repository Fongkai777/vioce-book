# Testing and answer-quality evaluation

## Automated tests

`pnpm test` checks the deterministic retrieval layer:

1. English and Chinese chapter-heading detection.
2. Section and page provenance across page boundaries.
3. BM25 preference for exact rare terminology.
4. Hybrid ranking when semantic and lexical signals differ.

`pnpm lint` and `pnpm build` cover static correctness and deployment compatibility.

## Integration acceptance checklist

- Upload a selectable-text PDF containing at least ten chapters.
- Confirm page, section, and passage counts appear after indexing.
- Ask a typed question and verify that an answer, source cards, and audio are produced.
- Record a microphone question and verify the transcript is used as the query.
- Open every citation used in an answer and confirm the cited claim is supported.
- Ask an unanswerable question and confirm the system says the evidence is insufficient.
- Deny microphone permission and confirm typed input remains usable.
- Upload a scanned PDF and confirm the OCR limitation is explicit.
- Test narrow and wide layouts and keyboard focus visibility.

## Answer-quality dataset

Create 25 questions for the chosen test book:

- 8 direct fact questions.
- 6 paraphrased questions.
- 4 cross-chapter synthesis questions.
- 3 exact-name or exact-term questions.
- 4 deliberately unanswerable questions.

For each question, record one or more gold pages and a short gold answer.

## Metrics

| Metric | Target | Method |
| --- | ---: | --- |
| Passage recall@6 | >= 0.84 | At least one gold page appears in the six passages |
| Citation precision | >= 0.90 | Human checks whether cited text supports its claim |
| Answer groundedness | >= 4/5 | Human rubric: unsupported claims reduce score |
| Unanswerable accuracy | >= 0.75 | Correctly refuses unsupported questions |
| Voice task completion | >= 0.90 | Transcribe, answer, and play without manual recovery |
| Median answer latency | < 8 s | Query start to visible answer on the test connection |

## Ablation

Run the same 25 questions with three retrieval configurations:

1. Dense-only top 6.
2. Dense + BM25 with reciprocal-rank fusion.
3. Hybrid fusion plus diversity selection.

Report recall@6 and citation precision for each. This demonstrates whether the additional retrieval stages materially improve the selected book rather than merely adding complexity.

