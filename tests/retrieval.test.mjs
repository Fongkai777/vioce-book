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

test("BM25 stays fast on a long book and reuses cached chunk statistics", () => {
  const words = "alice queen king rabbit said the of and to a".split(" ");
  const chunks = Array.from({ length: 1500 }, (_, i) => ({ sectionTitle: "Chapter", text: Array.from({ length: 250 }, (_, j) => words[(i * 7 + j * 13) % words.length] + (j % 5 ? "" : `x${(i * j) % 997}`)).join(" ") }));
  const first = bm25Scores("what did the queen say to alice", chunks);
  const started = performance.now();
  const second = bm25Scores("what did the queen say to alice", chunks);
  assert.deepEqual(second, first);
  assert.ok(performance.now() - started < 500, "a cached query over 1,500 passages should not block the page");
  const before = bm25Scores("zebra", chunks)[0];
  chunks[0].text = "zebra zebra zebra"; // edited in place: cache must not serve stale terms
  assert.equal(before, 0);
  assert.ok(bm25Scores("zebra", chunks)[0] > 0);
});

test("books with chapter headings ignore all-caps songs and choruses as sections", () => {
  const chunks = buildStructuralChunks([
    { pageNumber: 1, text: "CHAPTER I. Down the Rabbit-Hole\nAlice was beginning to get very tired." },
    { pageNumber: 2, text: "She sang a song.\nCHORUS.\nWow! wow! wow!\nTHE KING AND QUEEN OF HEARTS.\nThe court assembled." },
    { pageNumber: 3, text: "CHAPTER II. The Pool of Tears\nCuriouser and curiouser!" },
  ], 2000, 0);
  assert.deepEqual(chunks.map(chunk => chunk.sectionTitle), ["CHAPTER I. Down the Rabbit-Hole", "CHAPTER II. The Pool of Tears"]);
  assert.match(chunks[0].text, /CHORUS\.\nWow/);
  // Documents without explicit chapters still use the broader heading heuristic.
  const plain = buildStructuralChunks([{ pageNumber: 1, text: "INTRODUCTION OVERVIEW\nBody text here." }], 2000, 0);
  assert.equal(plain[0].sectionTitle, "INTRODUCTION OVERVIEW");
});
