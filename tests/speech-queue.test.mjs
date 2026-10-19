import test from "node:test";
import assert from "node:assert/strict";
import { requestSpeech, sequentialJobs } from "../lib/speech-queue.ts";

const busy = () => Response.json({ error: "Too many AI requests are running. Please wait a moment and retry." }, { status: 429 });

test("speech segments are requested one at a time, in order, and stop after a failure", async () => {
  let running = 0, peak = 0; const started = [];
  const load = async (segment) => { started.push(segment); running++; peak = Math.max(peak, running); await new Promise(r => setTimeout(r, 15)); running--; if (segment === "bad") throw new Error("boom"); return segment.toUpperCase(); };
  const jobs = sequentialJobs(["first", "second", "third"], load);
  assert.deepEqual((await Promise.all(jobs)).map(job => job.value), ["FIRST", "SECOND", "THIRD"]);
  assert.equal(peak, 1, "a reply must not occupy both of the account's concurrency slots");
  started.length = 0;
  const failed = await Promise.all(sequentialJobs(["ok", "bad", "never"], load));
  assert.equal(failed[1].error.message, "boom");
  assert.equal(failed[2].error.message, "boom");
  assert.deepEqual(started, ["ok", "bad"], "segments after a failure are not requested");
});

test("a busy 429 is retried; daily-limit 429 and other errors are not", async () => {
  const signal = new AbortController().signal;
  let calls = 0;
  const response = await requestSpeech("hi", signal, async () => (++calls < 3 ? busy() : new Response("mp3")), [1, 1, 1]);
  assert.equal(await response.text(), "mp3"); assert.equal(calls, 3);

  calls = 0;
  await assert.rejects(requestSpeech("hi", signal, async () => { calls++; return Response.json({ error: "Your daily speech playback allowance has been reached" }, { status: 429 }); }, [1, 1, 1]), /daily speech/);
  assert.equal(calls, 1);

  calls = 0;
  await assert.rejects(requestSpeech("hi", signal, async () => { calls++; return busy(); }, [1, 1]), /Too many AI requests/);
  assert.equal(calls, 3, "gives up after the configured retries");
});

test("cancelling during a retry wait stops immediately without another request", async () => {
  const controller = new AbortController(); let calls = 0;
  const pending = requestSpeech("hi", controller.signal, async () => { calls++; return busy(); }, [10_000]);
  setTimeout(() => controller.abort(new DOMException("stopped", "AbortError")), 20);
  await assert.rejects(pending, /stopped/);
  assert.equal(calls, 1);
});
