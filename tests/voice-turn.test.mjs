import test from "node:test";
import assert from "node:assert/strict";
import { TurnGate, VoiceDetector, pcmWav, speechSegments } from "../lib/voice-turn.ts";
import { normalizeHistory } from "../lib/conversation-context.ts";

const frame = (amplitude, ms = 100) => new Float32Array(ms * 16).fill(amplitude);
test("silence and a brief click do not start a voice turn", () => {
  const detector = new VoiceDetector(16000);
  assert.equal(detector.push(frame(0)).level, 0);
  assert.equal(detector.push(frame(.1)).started, false);
  assert.equal(detector.push(frame(0)).started, false);
  assert.equal(detector.flush(), undefined);
});
test("voice level follows input; speech includes pre-roll and ends after a pause", () => {
  const detector = new VoiceDetector(16000);
  detector.push(frame(0)); detector.push(frame(.1));
  const start = detector.push(frame(.1)); assert.equal(start.started, true); assert.equal(start.level, 1);
  for (let i = 0; i < 10; i++) assert.equal(detector.push(frame(0)).utterance, undefined);
  const end = detector.push(frame(0)); assert.equal(end.utterance.length, 14 * 1600);
  assert.equal(detector.speaking, false); assert.equal(detector.flush(), undefined);
});
test("barge-in needs sustained louder input while the assistant plays", () => {
  const detector = new VoiceDetector(16000);
  for (let i = 0; i < 10; i++) assert.equal(detector.push(frame(.02), true).started, false);
  for (let i = 0; i < 3; i++) assert.equal(detector.push(frame(.06), true).started, false);
  assert.equal(detector.push(frame(.06), true).started, true);
  assert.ok(detector.flush()); detector.reset(); assert.equal(detector.speaking, false);
});
test("long utterances finish before the server's 60-second limit", () => {
  const detector = new VoiceDetector(16000); let result;
  for (let i = 0; i < 580; i++) result = detector.push(frame(.08));
  assert.equal(result.utterance.length / 16000, 58);
});
test("PCM WAV preserves duration, downsampling to 16 kHz and clipping safely", async () => {
  const blob = pcmWav(new Float32Array(48000).fill(2), 48000);
  const bytes = await blob.arrayBuffer(), view = new DataView(bytes);
  assert.equal(blob.type, "audio/wav"); assert.equal(bytes.byteLength, 32044);
  assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), "RIFF");
  assert.equal(view.getUint32(24, true), 16000); assert.equal(view.getUint16(22, true), 1);
  assert.equal(view.getInt16(44, true), 32767);
});
test("new turns abort old work and late old completions cannot own the current turn", async () => {
  const gate = new TurnGate(), old = gate.next();
  const late = Promise.resolve().then(() => old.throwIfAborted());
  const current = gate.next(); await assert.rejects(late, {name:"AbortError"});
  assert.equal(current.aborted, false); gate.cancel(); assert.equal(current.aborted, true);
});
test("speech is prefetched in at most two chunks and strips source markers", () => {
  assert.deepEqual(speechSegments("Hello [S1]."), ["Hello ."]);
  const text = "This is a readable sentence. ".repeat(35);
  const parts = speechSegments(text); assert.equal(parts.length, 2); assert.ok(parts[0].length <= 220);
  assert.equal(parts.join(" "), text.trim());
  assert.equal(speechSegments("中".repeat(6000)).join("").length, 5000);
});
test("interrupted audio stays in written history without implying it was heard", () => {
  const turn = { question:"why", answer:"Full answer [S1]", audioInterrupted:true };
  const result = normalizeHistory([turn]);
  assert.match(result[0].answer, /do not assume the reader heard/);
  assert.equal(turn.answer, "Full answer [S1]");
});
