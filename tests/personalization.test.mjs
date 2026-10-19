import test from "node:test";
import assert from "node:assert/strict";
import { defaultPreferences, isFollowUpQuestion, normalizePreferences, preferenceInstructions, retrievalQuestion } from "../lib/personalization.ts";
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
  assert.equal(retrievalQuestion("为什么？", turns), "9\n为什么？");
});

test("retrieval queries stay standalone unless the question depends on the previous turn", () => {
  const history = [
    { question: "What did the label on the little bottle say?", answer: "DRINK ME, with a poison check." },
    { question: "What strange thing happens when the Cheshire Cat disappears?", answer: "It vanishes slowly." },
  ];
  // Topic changes must not drag earlier questions or answers into search.
  assert.equal(retrievalQuestion("How does the story end? Was Alice's adventure real?", history), "How does the story end? Was Alice's adventure real?");
  assert.equal(retrievalQuestion("Who is Bill the Lizard in this story?", history), "Who is Bill the Lizard in this story?");
  assert.doesNotMatch(retrievalQuestion("Who is Bill the Lizard in this story?", history), /DRINK|poison|上一个问题/);
  // Dependent follow-ups borrow only the previous question.
  assert.equal(retrievalQuestion("And what did Alice say about that?", history), `${history[1].question}\nAnd what did Alice say about that?`);
  assert.equal(retrievalQuestion("他后来怎么样了？", history), `${history[1].question}\n他后来怎么样了？`);
  assert.equal(retrievalQuestion("Why?", history), `${history[1].question}\nWhy?`);
  // Explicit turn references use that turn's question.
  assert.equal(retrievalQuestion("第 1 轮问的那个标签再解释一下", history), `${history[0].question}\n第 1 轮问的那个标签再解释一下`);
  assert.equal(retrievalQuestion("Tell me about the White Rabbit.", []), "Tell me about the White Rabbit.");
  assert.equal(isFollowUpQuestion("What is the central argument of this book?"), false);
  assert.equal(isFollowUpQuestion("How does the story end?"), false);
  assert.equal(isFollowUpQuestion("What about the Hatter?"), true);
});
