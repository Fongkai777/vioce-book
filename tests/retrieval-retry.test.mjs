import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { RetrievalRetryCache } from "../lib/retrieval-retry.ts";

const scope = { ownerId: "alice", bookId: "book", model: "model", turnId: "turn", query: "question with history" };
const signal = () => new AbortController().signal;

test("answer retries reuse successful retrieval without repeating the paid search", async () => {
  const cache = new RetrievalRetryCache(), index = [], result = [{ id: "c1" }];
  let calls = 0;
  for (let attempt = 0; attempt < 45; attempt++) {
    assert.equal(await cache.retrieve(scope, index, signal(), async () => { calls++; return result; }), result);
  }
  assert.equal(calls, 1);
});

test("retrieval reuse requires the same account, book, model, turn, query and loaded index", async () => {
  const cache = new RetrievalRetryCache(), index = [];
  let calls = 0;
  const load = async () => ++calls;
  assert.equal(await cache.retrieve(scope, index, signal(), load), 1);
  for (const field of Object.keys(scope)) {
    await cache.retrieve({ ...scope, [field]: "different" }, index, signal(), load);
  }
  await cache.retrieve(scope, [], signal(), load);
  assert.equal(calls, 7);
  cache.clear();
  await cache.retrieve(scope, index, signal(), load);
  assert.equal(calls, 8);
});

test("failed or cancelled retrievals cannot poison a retry or return stale passages", async () => {
  const cache = new RetrievalRetryCache(), index = [];
  await assert.rejects(cache.retrieve(scope, index, signal(), async () => { throw Error("provider failed"); }), /provider failed/);
  const controller = new AbortController();
  await assert.rejects(cache.retrieve(scope, index, controller.signal, async () => { controller.abort(); return "stale"; }), { name: "AbortError" });
  await assert.rejects(cache.retrieve(scope, index, signal(), async () => { cache.clear(); return "old scope"; }), { name: "AbortError" });
  assert.equal(await cache.retrieve(scope, index, signal(), async () => "fresh"), "fresh");
  await assert.rejects(cache.retrieve(scope, index, controller.signal, async () => "unused"), { name: "AbortError" });
});

test("retrieval retry memory is bounded and oldest entries are evicted", async () => {
  const cache = new RetrievalRetryCache(), index = [];
  for (let i = 0; i < 17; i++) await cache.retrieve({ ...scope, turnId: String(i) }, index, signal(), async () => i);
  assert.equal(await cache.retrieve({ ...scope, turnId: "0" }, index, signal(), async () => "reloaded"), "reloaded");
  assert.equal(await cache.retrieve({ ...scope, turnId: "16" }, index, signal(), async () => "unexpected"), 16);
});

test("chat wraps embedding and passage retrieval in the retry cache before answering", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /retrievalRetries\.current\.retrieve\([\s\S]*?await embedTexts\([\s\S]*?return hybridRetrieve\([\s\S]*?fetch\("\/api\/answer"/);
  assert.match(page, /const exchangeId = retryId \|\| crypto\.randomUUID\(\)/);
  assert.match(page, /async function logout\(\)[\s\S]*?retrievalRetries\.current\.clear\(\)/);
});
