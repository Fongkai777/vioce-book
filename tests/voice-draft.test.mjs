import test from "node:test";
import assert from "node:assert/strict";
import { VoiceDraft } from "../lib/voice-draft.ts";

test("valid then empty transcription preserves the pending question and auto-send eligibility", () => {
  const draft = new VoiceDraft(); draft.append("  Keep my recognized question.  ");
  for (const empty of ["", "   ", null, undefined]) assert.equal(draft.append(empty), false);
  assert.equal(draft.text, "Keep my recognized question.");
  assert.equal(draft.canAutoSend(0, false), true);
});
test("an empty-only turn has nothing to send and does not prevent the next turn", () => {
  const draft = new VoiceDraft(); draft.append(""); assert.equal(draft.canAutoSend(0,false),false);
  draft.append("Next real question"); assert.equal(draft.canAutoSend(0,false),true);
});
test("pending requests and speech onset delay sending without losing words", () => {
  const draft = new VoiceDraft(); draft.append("First half");
  assert.equal(draft.canAutoSend(1,false),false); assert.equal(draft.canAutoSend(0,true),false);
  draft.append("second half"); assert.equal(draft.text,"First half second half");
  assert.equal(draft.canAutoSend(0,false),true);
});
test("service failure, mute and ending voice hold the draft until explicit submission", () => {
  const draft = new VoiceDraft(); draft.append("Preserve this"); draft.hold();
  draft.append(""); draft.append("and this");
  assert.equal(draft.text,"Preserve this and this"); assert.equal(draft.canAutoSend(0,false),false);
  draft.edit("Edited question"); assert.equal(draft.text,"Edited question"); assert.equal(draft.canAutoSend(0,false),false);
  draft.clear(); assert.equal(draft.text,""); assert.equal(draft.needsReview,false);
});
test("a question beyond the input limit requires review rather than silently auto-sending", () => {
  const draft = new VoiceDraft(); draft.append("a".repeat(2001));
  assert.equal(draft.text.length,2000); assert.equal(draft.canAutoSend(0,false),false);
});
