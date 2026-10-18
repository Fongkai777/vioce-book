import test from "node:test";
import assert from "node:assert/strict";
import { parseBookBundle } from "../lib/book-import.mjs";
import { cosineSimilarity } from "../lib/retrieval.mjs";

function bundle() {
  return { format: "voicebook-library", version: 1, books: [{
    id: "copilot-test", name: "A saved book", embeddingModel: "text-embedding-v4", embeddingDimensions: 1024,
    fullText: "Original text", index: [{ id: "existing-node", sectionTitle: "Saved chunk 1",
      pageStart: 0, pageEnd: 0, text: "Original text", embedding: Array(1024).fill(0.25) }],
  }] };
}

test("import preserves existing chunks, IDs and vectors without inventing pages", () => {
  const input = bundle();
  const [result] = parseBookBundle(input);
  assert.equal(result.embeddingModel, "text-embedding-v4");
  assert.equal(result.pages, 0);
  assert.deepEqual(result.index, input.books[0].index);
  assert.equal(result.fullText, "Original text");
  assert.equal(result.index[0].embedding, input.books[0].index[0].embedding);
});

test("rejects a wrong vector space, bad vectors and duplicate book IDs", () => {
  const badModel = bundle(); badModel.books[0].embeddingModel = "unknown";
  assert.throws(() => parseBookBundle(badModel), /Unsupported/);
  const badVector = bundle(); badVector.books[0].index[0].embedding.pop();
  assert.throws(() => parseBookBundle(badVector), /Invalid saved passage/);
  const nonFinite = bundle(); nonFinite.books[0].index[0].embedding[0] = Infinity;
  assert.throws(() => parseBookBundle(nonFinite), /Invalid saved passage/);
  const repeated = bundle(); repeated.books.push(repeated.books[0]);
  assert.throws(() => parseBookBundle(repeated), /duplicate/);
  assert.throws(() => cosineSimilarity([1, 0], [1, 0, 0]), /different dimensions/);
});
