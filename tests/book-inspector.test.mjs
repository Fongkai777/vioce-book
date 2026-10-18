import test from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import { saveBook, getBook, getBookPdf, listBooks, deleteBook } from "../lib/book-library.ts";
import { filterChunks, chunkPageLabel, indexStatistics, bookReadiness, locatePassage } from "../lib/book-inspector.ts";

const chunks = [
  { id: "first", sectionTitle: "Opening", pageStart: 1, pageEnd: 2, text: "The quiet READER 阅读", embedding: [0.3, 0.4] },
  { id: "second", sectionTitle: "Closing", pageStart: 0, pageEnd: 0, text: "Final remarks", embedding: [0.2, 0.5] },
];
test("chunk search supports text, IDs, sections and Chinese without mutating the saved index", () => {
  const before = structuredClone(chunks);
  assert.deepEqual(filterChunks(chunks, " reader ", ""), [chunks[0]]);
  assert.deepEqual(filterChunks(chunks, "阅读", "Opening"), [chunks[0]]);
  assert.deepEqual(filterChunks(chunks, "SECOND", ""), [chunks[1]]);
  assert.deepEqual(filterChunks(chunks, "", "Closing"), [chunks[1]]);
  assert.deepEqual(filterChunks(chunks, "reader", "Closing"), []);
  assert.deepEqual(chunks, before);
  assert.equal(chunkPageLabel(chunks[0]), "Pages 1–2");
  assert.equal(chunkPageLabel(chunks[1]), "Page unavailable");
  assert.equal(chunkPageLabel({pageStart: 3, pageEnd: 3}), "Page 3");
});
test("index statistics expose actual dimensions and invalid vectors, not fabricated readiness", () => {
  const stats = indexStatistics(chunks, 2);
  assert.equal(stats.validVectors, 2); assert.equal(stats.withPages, 1); assert.equal(stats.sections, 2);
  assert.deepEqual(stats.dimensions, [2]); assert.equal(stats.values, 4);
  const invalid = indexStatistics([...chunks, {...chunks[0], embedding: [NaN, 1]}, {...chunks[0], embedding: [1]}], 2);
  assert.equal(invalid.validVectors, 2); assert.deepEqual(invalid.dimensions, [2, 1]);
  assert.equal(indexStatistics([], 1536).validVectors, 0);
});
test("readiness rejects empty, zero, non-finite and mismatched vectors or empty text", () => {
  assert.equal(bookReadiness(chunks, 2), true);
  assert.equal(bookReadiness([], 2), false);
  for (const embedding of [[0,0], [NaN,1], [1], [Infinity,1]]) {
    assert.equal(bookReadiness([{...chunks[0],embedding}], 2), false);
  }
  assert.equal(bookReadiness([{...chunks[0],text:"  "}], 2), false);
});
test("citation targets locate the original passage on later pages without guessing a page", () => {
  const many = Array.from({length:25}, (_,i)=>({...chunks[1],id:`p-${i}`}));
  assert.deepEqual(locatePassage(many,"p-24"),{chunk:many[24],listPage:2});
  assert.equal(locatePassage(many,"p-24").chunk.pageStart,0);
  assert.equal(locatePassage(many,"missing"),undefined);
  assert.equal(locatePassage(many,"p-11").listPage,0);
  assert.equal(locatePassage(many,"p-12").listPage,1);
});
test("new extraction metadata survives lightweight summaries; legacy metadata is not invented", async () => {
  const base = {id:"metadata",name:"Metadata",pages:5,chapters:1,chunks:2,fileSize:10,storedAt:"2026-01-01",lastOpenedAt:"2026-01-01",index:chunks};
  await saveBook("metadata-owner",{...base,author:"PDF author",extraction:{ocrPages:2,readablePages:4}});
  const [saved] = await listBooks("metadata-owner");
  assert.equal(saved.author,"PDF author");
  assert.deepEqual(saved.extraction,{ocrPages:2,readablePages:4});
  assert.equal("index" in saved,false);
  await saveBook("legacy-owner",base);
  const [legacy] = await listBooks("legacy-owner");
  assert.equal(legacy.extraction,undefined); assert.equal(legacy.author,undefined);
});
test("PDF preview reads only the selected account's original; chat/list reads stay lightweight", async () => {
  const book = { id: "shared-id", name: "Original", pages: 2, chapters: 2, chunks: 2, fileSize: 5, storedAt: "2026-01-01", lastOpenedAt: "2026-01-01", index: chunks, pdf: new Blob(["Alice PDF"], {type: "application/pdf"}) };
  await saveBook("alice", book);
  await saveBook("bob", {...book, pdf: new Blob(["Bob PDF"], {type: "application/pdf"})});
  assert.equal(await (await getBookPdf("alice", book.id)).text(), "Alice PDF");
  assert.equal(await (await getBookPdf("bob", book.id)).text(), "Bob PDF");
  assert.equal(await getBookPdf("other", book.id), undefined);
  assert.equal(await getBookPdf("", book.id), undefined);
  assert.equal("pdf" in await getBook("alice", book.id), false);
  assert.equal("index" in (await listBooks("alice"))[0], false);
  const {pdf, ...textOnly} = book;
  await saveBook("alice", {...textOnly, id: "text-only"});
  assert.equal(await getBookPdf("alice", "text-only"), undefined);
  await deleteBook("alice", book.id);
  assert.equal(await getBookPdf("alice", book.id), undefined);
  assert.equal(await (await getBookPdf("bob", book.id)).text(), "Bob PDF");
});
