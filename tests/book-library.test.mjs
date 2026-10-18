import test from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import { listBooks, getBook, markBookOpened, saveBook, deleteBook } from "../lib/book-library.ts";

function open(version) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("voicebook-library", version);
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore("books", { keyPath: "storageKey" });
      store.createIndex("ownerId", "ownerId");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function done(tx) { return new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = () => reject(tx.error); }); }
function result(req) { return new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); }

test("v1 migration preserves content and PDF; list and timestamp operations only use metadata", async () => {
  const old = { id: "old", name: "Legacy book", pages: 5, chapters: 1, chunks: 1, fileSize: 3,
    storedAt: "2020-01-01", lastOpenedAt: "2020-01-01", ownerId: "alice", storageKey: "alice:old",
    pdf: new Blob(["pdf"]), index: [{ id: "c1", text: "Saved text", sectionTitle: "Section", pageStart: 1, pageEnd: 2, embedding: [0.5, 0.5] }] };
  const v1 = await open(1);
  const tx = v1.transaction("books", "readwrite"); tx.objectStore("books").put(old); await done(tx); v1.close();
  const books = await listBooks("alice");
  assert.equal(books.length, 1); assert.equal(books[0].embeddingModel, "text-embedding-3-small");
  assert.equal("index" in books[0], false); assert.equal("pdf" in books[0], false);
  const restored = await getBook("alice", "old");
  assert.deepEqual(restored.index, old.index); assert.equal("pdf" in restored, false);
  assert.deepEqual(await listBooks("bob"), []);
  assert.equal(await getBook("bob", "old"), undefined);
  const v2 = await open(2);
  const before = await result(v2.transaction("book-content").objectStore("book-content").get("alice:old"));
  const original = await result(v2.transaction("book-files").objectStore("book-files").get("alice:old"));
  assert.equal(await original.pdf.text(), "pdf");
  await markBookOpened("alice", "old");
  const after = await result(v2.transaction("book-content").objectStore("book-content").get("alice:old"));
  assert.deepEqual(after, before);
  assert.notEqual((await listBooks("alice"))[0].lastOpenedAt, "2020-01-01");
  const metadata = await result(v2.transaction("books").objectStore("books").get("alice:old"));
  assert.equal("pdf" in metadata, false); assert.equal("index" in metadata, false);
  await saveBook("bob", { ...old, embeddingModel: "text-embedding-v4", embeddingDimensions: 1024 });
  assert.equal((await listBooks("bob"))[0].embeddingModel, "text-embedding-v4");
  await deleteBook("alice", "old");
  assert.deepEqual(await listBooks("alice"), []);
  assert.equal((await listBooks("bob")).length, 1);
  for (const name of ["books", "book-content", "book-files"]) {
    assert.equal(await result(v2.transaction(name).objectStore(name).get("alice:old")), undefined);
  }
  v2.close();
});
