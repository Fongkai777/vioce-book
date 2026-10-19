import test from "node:test";
import assert from "node:assert/strict";
import {VoiceInputGate} from "../lib/voice-input-gate.ts";
import {TurnGate} from "../lib/voice-turn.ts";
import {VoiceDraft} from "../lib/voice-draft.ts";

test("empty follow-up noise preserves generation and releases queued playback", async () => {
  const input = new VoiceInputGate(), turns = new TurnGate(), draft = new VoiceDraft();
  const reply = turns.next(); input.begin();
  let played = false;
  const playback = input.wait(reply).then(() => { played = true; });
  await Promise.resolve(); assert.equal(played, false);
  if (draft.append("  ")) turns.cancel();
  assert.equal(reply.aborted, false);
  input.finish(); await playback; assert.equal(played, true);
});
test("confirmed words cancel the old reply without losing the new transcript", async () => {
  const input = new VoiceInputGate(), turns = new TurnGate(), draft = new VoiceDraft();
  const reply = turns.next(); input.begin(); const waiting = input.wait(reply);
  if (draft.append("A real follow-up")) turns.cancel();
  await assert.rejects(waiting, {name:"AbortError"}); input.finish();
  assert.equal(draft.text, "A real follow-up");
  assert.equal(draft.canAutoSend(0, false), true);
});
test("back-to-back utterances cannot release playback into the next utterance", async () => {
  const input = new VoiceInputGate(), controller = new AbortController(); input.begin();
  let played = false; const waiting = input.wait(controller.signal).then(() => { played = true; });
  input.finish(); input.begin(); await Promise.resolve(); await Promise.resolve();
  assert.equal(played, false); input.finish(); await waiting; assert.equal(played, true);
});
test("cancelled playback rejects even when input is idle", async () => {
  const input = new VoiceInputGate(), controller = new AbortController(); controller.abort();
  await assert.rejects(input.wait(controller.signal), {name:"AbortError"});
});
