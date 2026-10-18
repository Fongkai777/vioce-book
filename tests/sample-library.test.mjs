import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import "fake-indexeddb/auto";
import { sampleBooks } from "../content/sample-books.mjs";
import { addSampleToLibrary } from "../lib/sample-library.ts";
import { getBook, listBooks, saveBook, saveBookIfMissing, deleteBook } from "../lib/book-library.ts";
import { loadHistory, saveHistory, clearHistory, loadSummaries } from "../lib/reading-history.ts";

const generated = JSON.parse(readFileSync(new URL("../content/sample-index.json", import.meta.url), "utf8"));
const payload = book => ({ format: "voicebook-library", version: 1, books: [book] });
const map = new Map();
globalThis.localStorage = { get length() { return map.size; }, key: i => [...map.keys()][i], getItem: k => map.get(k) ?? null, setItem: (k,v) => map.set(k,v), removeItem: k => map.delete(k) };

test("sample indexes match original content, have valid vectors, and contain no personal metadata", () => {
  assert.equal(generated.sourceHash, createHash("sha256").update(JSON.stringify(sampleBooks)).digest("hex"));
  assert.equal(generated.books.length, 2);
  for (const [i, book] of generated.books.entries()) {
    assert.equal(book.id, sampleBooks[i].id);
    assert.equal(book.embeddingModel, "text-embedding-3-small");
    assert.equal(book.embeddingDimensions, 1536);
    assert.equal(book.index.length, sampleBooks[i].chapters.length);
    assert.equal(book.ownerId, undefined);
    assert.equal(book.storageKey, undefined);
    assert.equal(book.history, undefined);
    for (const [j, chunk] of book.index.entries()) {
      assert.equal(chunk.text, sampleBooks[i].chapters[j].text);
      assert.equal(chunk.embedding.length, 1536);
      assert.ok(chunk.embedding.every(Number.isFinite));
      assert.ok(chunk.embedding.some(x => x !== 0));
      assert.equal(chunk.pageStart, 0); // No invented PDF page numbers.
    }
  }
});

test("sample copies, indexes, conversations and deletion stay scoped to the signed-in account", async () => {
  const source = generated.books[0];
  let downloads = 0;
  const request = async url => {
    assert.equal(url, `/api/samples?id=${source.id}`);
    downloads++;
    // Ownership fields in downloaded content cannot choose the destination account.
    return Response.json(payload({ ...source, ownerId: "victim", storageKey: `victim:${source.id}` }));
  };
  const alice = await addSampleToLibrary("sample-alice", source.id, request);
  const bob = await addSampleToLibrary("sample-bob", source.id, request);
  assert.equal(downloads, 2);
  assert.equal(alice.ownerId, "sample-alice");
  assert.equal(bob.ownerId, "sample-bob");
  assert.deepEqual(alice.index, bob.index);
  assert.equal(alice.chapters, 6);
  assert.equal(alice.importedFrom, "Voicebook sample");
  assert.equal(await getBook("victim", source.id), undefined);
  assert.equal((await listBooks("sample-alice")).length, 1);
  assert.equal((await listBooks("sample-alice"))[0].index, undefined);
  await saveHistory("sample-alice", source.id, [{ id: "a", question: "Alice's private question" }], { a: "Alice memory" });
  await saveHistory("sample-bob", source.id, [{ id: "b", question: "Bob's private question" }], { b: "Bob memory" });
  await saveBook("sample-alice", { ...alice, name: "My existing copy", index: alice.index.map((chunk, i) => i ? chunk : { ...chunk, text: "Alice-only content" }) });
  const reopened = await addSampleToLibrary("sample-alice", source.id, request);
  assert.equal(downloads, 2, "reopening a local copy must not download or re-embed");
  assert.equal(reopened.name, "My existing copy");
  assert.equal(reopened.index[0].text, "Alice-only content");
  assert.equal((await getBook("sample-bob", source.id)).index[0].text, source.index[0].text);
  assert.equal((await loadHistory("sample-alice", source.id))[0].id, "a");
  await deleteBook("sample-alice", source.id);
  await clearHistory("sample-alice", source.id);
  assert.equal((await listBooks("sample-alice")).length, 0);
  assert.equal((await loadHistory("sample-alice", source.id)).length, 0);
  assert.deepEqual(await loadSummaries("sample-alice", source.id), {});
  assert.equal((await listBooks("sample-bob")).length, 1);
  assert.equal((await loadHistory("sample-bob", source.id))[0].id, "b");
  assert.deepEqual(await loadSummaries("sample-bob", source.id), { b: "Bob memory" });
});

test("concurrent sample saves are insert-only and malformed downloads never persist", async () => {
  const book = await addSampleToLibrary("race-source", generated.books[1].id, async () => Response.json(payload(generated.books[1])));
  const results = await Promise.all([saveBookIfMissing("race", book), saveBookIfMissing("race", { ...book, name: "Concurrent replacement" })]);
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal((await getBook("race", book.id)).name, book.name);
  await assert.rejects(addSampleToLibrary("", book.id), /Invalid/);
  await assert.rejects(addSampleToLibrary("invalid", "../private-book"), /Invalid/);
  await assert.rejects(addSampleToLibrary("invalid", book.id, async () => Response.json(payload(generated.books[0]))), /does not match/);
  const broken = structuredClone(book); broken.index[0].embedding = [1, 2];
  await assert.rejects(addSampleToLibrary("invalid", book.id, async () => Response.json(payload(broken))));
  await assert.rejects(addSampleToLibrary("invalid", book.id, async () => new Response("", { status: 401 })), /sign in/i);
  assert.equal((await listBooks("invalid")).length, 0);
});
