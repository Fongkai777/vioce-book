import test from "node:test";
import assert from "node:assert/strict";
import { defaultPreferences, normalizePreferences, preferenceInstructions, recentHistory, retrievalQuestion } from "../lib/personalization.ts";
import { clearHistory, loadHistory, saveHistory } from "../lib/reading-history.ts";

test("preferences default to private history and bounded explicit style", () => {
  assert.deepEqual(normalizePreferences(null), defaultPreferences);
  assert.equal(normalizePreferences({ rememberHistory: "true", tone: "bad", guidance: "x".repeat(1000) }).rememberHistory, false);
  assert.equal(normalizePreferences({ guidance: "x".repeat(1000) }).guidance.length, 600);
  assert.match(preferenceInstructions({ tone: "friendly", length: "brief" }), /亲切耐心.*一到两段/);
});
test("history is bounded and old citation numbers never pass as current citations", () => {
  const turns = Array.from({ length: 10 }, (_, i) => ({ question: String(i), answer: "answer [S3]" }));
  assert.deepEqual(recentHistory(turns).map(x => x.question), ["7", "8", "9"]);
  assert.equal(recentHistory(turns)[0].answer, "answer ");
  assert.equal(recentHistory([null, {}, { question: 1 }]).length, 0);
  assert.match(retrievalQuestion("为什么？", turns), /上一个问题：9/);
});
test("local history is isolated by account and book; clear preserves other accounts", () => {
  const map = new Map();
  globalThis.localStorage = { get length() { return map.size; }, key: i => [...map.keys()][i], getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), removeItem: k => map.delete(k) };
  saveHistory("alice", "one", Array.from({ length: 30 }, (_, i) => ({ question: String(i) })));
  saveHistory("alice", "two", [{ question: "other book" }]);
  saveHistory("bob", "one", [{ question: "private" }]);
  assert.equal(loadHistory("alice", "one").length, 20);
  clearHistory("alice", "one");
  assert.equal(loadHistory("alice", "one").length, 0);
  assert.equal(loadHistory("alice", "two").length, 1);
  clearHistory("alice");
  assert.equal(loadHistory("alice", "two").length, 0);
  assert.equal(loadHistory("bob", "one")[0].question, "private");
  delete globalThis.localStorage;
});
