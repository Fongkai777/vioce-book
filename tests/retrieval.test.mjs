import test from "node:test";
import assert from "node:assert/strict";
import { bm25Scores, buildStructuralChunks, hybridRetrieve, isLikelyHeading } from "../lib/retrieval.mjs";

test("detects English and Chinese chapter headings", () => {
  assert.equal(isLikelyHeading("Chapter 12 The Long Road"), true);
  assert.equal(isLikelyHeading("第三章 检索增强生成"), true);
  assert.equal(isLikelyHeading("This is an ordinary sentence with several words."), false);
});

test("structural chunks retain section and page provenance", () => {
  const chunks = buildStructuralChunks([
    { pageNumber: 1, text: "Chapter 1 Origins\nAlpha paragraph." },
    { pageNumber: 2, text: "Beta paragraph." },
    { pageNumber: 3, text: "Chapter 2 Results\nGamma paragraph." },
  ], 80, 10);
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].sectionTitle, "Chapter 1 Origins");
  assert.deepEqual([chunks[0].pageStart, chunks[0].pageEnd], [1, 2]);
});

test("BM25 promotes exact terminology", () => {
  const chunks = [
    { sectionTitle: "A", text: "vector search and semantic similarity" },
    { sectionTitle: "B", text: "BM25 catches exact product code ZX-941" },
  ];
  const scores = bm25Scores("ZX-941", chunks);
  assert.ok(scores[1] > scores[0]);
});

test("hybrid retrieval combines semantic and lexical signals", () => {
  const chunks = [
    { id: "a", sectionTitle: "Intro", text: "general overview", embedding: [1, 0] },
    { id: "b", sectionTitle: "Answer", text: "exact nebula protocol details", embedding: [0.6, 0.8] },
    { id: "c", sectionTitle: "Other", text: "unrelated appendix", embedding: [0, 1] },
  ];
  const result = hybridRetrieve("nebula protocol", [0.7, 0.7], chunks, 2);
  assert.equal(result[0].id, "b");
});
