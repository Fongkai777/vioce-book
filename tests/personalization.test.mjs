import test from "node:test";
import assert from "node:assert/strict";
import { defaultPreferences, normalizePreferences, preferenceInstructions, retrievalQuestion } from "../lib/personalization.ts";
import { normalizeHistory } from "../lib/conversation-context.ts";

test("preferences default to saved local history and preserve explicit opt-out", () => {
  assert.deepEqual(normalizePreferences(null), defaultPreferences);
  assert.equal(defaultPreferences.rememberHistory, true);
  assert.equal(normalizePreferences({}).rememberHistory, true);
  assert.equal(normalizePreferences({ tone: "friendly" }).rememberHistory, true);
  assert.equal(normalizePreferences({ rememberHistory: false }).rememberHistory, false);
  assert.equal(normalizePreferences({ rememberHistory: true }).rememberHistory, true);
  assert.equal(normalizePreferences({ rememberHistory: "true", tone: "bad", guidance: "x".repeat(1000) }).rememberHistory, true);
  assert.equal(normalizePreferences({ guidance: "x".repeat(1000) }).guidance.length, 600);
  assert.match(preferenceInstructions({ tone: "friendly", length: "brief" }), /亲切耐心.*一到两段/);
});
test("normalization keeps all turns and removes only stale citation markers", () => {
  const turns = Array.from({ length: 10 }, (_, i) => ({ question: String(i), answer: "answer [S3]" }));
  assert.equal(normalizeHistory(turns).length, 10);
  assert.equal(normalizeHistory(turns)[0].answer, "answer ");
  assert.equal(normalizeHistory([null, {}, { question: 1 }]).length, 0);
  assert.match(retrievalQuestion("为什么？", turns), /上一个问题：9/);
});
