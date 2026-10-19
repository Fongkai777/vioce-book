import test from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import { beginReply, settleReply, recoverReplies, updateVoiceMessage, leaveUnsent } from "../lib/chat-turns.ts";
import { normalizeHistory } from "../lib/conversation-context.ts";
import { saveHistory, loadHistory } from "../lib/reading-history.ts";
globalThis.localStorage = { getItem: () => null, removeItem() {} };

test("voice continuations and auto-send keep one stable message id in the conversation", () => {
  const first = updateVoiceMessage([], "First half", "speech");
  const combined = updateVoiceMessage(first, "First half second half", "speech");
  assert.equal(combined.length, 1);
  const sent = beginReply(combined, combined[0].question, "speech");
  assert.equal(sent.length, 1); assert.equal(sent[0].id, first[0].id);
  assert.equal(sent[0].question, "First half second half");
  assert.deepEqual(leaveUnsent(sent, "speech"), sent);
  assert.deepEqual(updateVoiceMessage(sent, "Late words", "speech"), sent);
});

test("unsent speech is retained in chat but excluded from model context", () => {
  const draft = updateVoiceMessage([], "Incomplete words", "speech");
  const kept = leaveUnsent(draft, "speech");
  assert.equal(kept[0].question, "Incomplete words");
  assert.equal(kept[0].replyStatus, "unsent");
  assert.deepEqual(recoverReplies(draft), kept);
  assert.deepEqual(normalizeHistory(draft), []);
  assert.deepEqual(normalizeHistory(kept), []);
});

test("a submitted question exists before the answer; interruption never removes it", () => {
  const pending = beginReply([], "Keep my question", "first");
  assert.equal(pending[0].question, "Keep my question");
  assert.equal(pending[0].replyStatus, "pending");
  const interrupted = settleReply(pending, "first", { replyStatus:"interrupted" });
  const next = beginReply(interrupted, "My follow-up", "second");
  assert.deepEqual(next.map(t => t.question), ["Keep my question", "My follow-up"]);
  assert.equal(next[0].replyStatus, "interrupted");
  assert.deepEqual(settleReply(next, "first", { replyStatus:"complete", answer:"Stale response" }), next);
});

test("failed questions retry in place without duplicating user messages", () => {
  const failed = settleReply(beginReply([], "Question", "one"), "one", { replyStatus:"failed", replyError:"Offline" });
  assert.equal(failed[0].question, "Question");
  const retried = beginReply(failed, failed[0].question, "one");
  assert.equal(retried.length, 1);
  assert.equal(retried[0].replyError, undefined);
  const complete = settleReply(retried, "one", { replyStatus:"complete", answer:"Answer", sources:[] });
  assert.equal(complete.length, 1);
  assert.equal(complete[0].question, "Question");
  assert.equal(complete[0].answer, "Answer");
  assert.deepEqual(settleReply(complete, "one", { replyStatus:"interrupted" }), complete);
});

test("refresh preserves pending/failed questions, recovers status and stays account/book scoped", async () => {
  const pending = beginReply([], "Saved before the answer", "pending");
  await saveHistory("turn-test-alice", "book-one", pending);
  const restored = recoverReplies(await loadHistory("turn-test-alice", "book-one"));
  assert.equal(restored[0].question, pending[0].question);
  assert.equal(restored[0].replyStatus, "interrupted");
  assert.equal(restored[0].answer, "");
  assert.deepEqual(await loadHistory("turn-test-bob", "book-one"), []);
  assert.deepEqual(await loadHistory("turn-test-alice", "book-two"), []);
  const failed = settleReply(pending, "pending", { replyStatus:"failed", replyError:"Offline" });
  await saveHistory("turn-test-alice", "book-one", failed);
  assert.deepEqual(recoverReplies(await loadHistory("turn-test-alice", "book-one")), failed);
});

test("unanswered questions remain in model context without pretending an answer was delivered", () => {
  const history = normalizeHistory([
    {question:"Original",answer:"Earlier answer [S1]"},
    ...settleReply(beginReply([], "Unanswered question", "pending"), "pending", {replyStatus:"interrupted"}),
  ]);
  assert.equal(history.length, 2);
  assert.equal(history[0].answer, "Earlier answer ");
  assert.equal(history[1].question, "Unanswered question");
  assert.match(history[1].answer, /No assistant answer was delivered/);
});
