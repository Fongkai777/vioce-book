import test from "node:test";
import assert from "node:assert/strict";
import { releaseAudioContext } from "../lib/audio-context.ts";

test("audio cleanup detaches before asynchronous close and is repeatable", async () => {
  let calls = 0;
  const holder = { current: { state: "running", close: async () => { calls++; } } };
  releaseAudioContext(holder); releaseAudioContext(holder);
  assert.equal(holder.current, null); assert.equal(calls, 1);
});
test("already-closed or rejected audio cleanup does not leak a rejection", async () => {
  const closed = { current: { state: "closed", close: () => { throw new Error("must not close"); } } };
  releaseAudioContext(closed);
  const rejected = { current: { state: "running", close: async () => { throw new Error("already closing"); } } };
  releaseAudioContext(rejected);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(closed.current, null); assert.equal(rejected.current, null);
});
