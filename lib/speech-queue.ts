// Each account may run two AI requests at once. Requesting every speech segment in
// parallel used both slots for one reply, so a still-running request (for example
// speech cancelled by an interruption) made the next segment fail with 429.
// Segments are therefore requested one after another — the next one while the
// previous one plays — and a "busy" 429 is retried briefly.

const BUSY = /too many ai requests are running/i;
export const SPEECH_RETRY_DELAYS_MS = [800, 1600, 3200];

export type SpeechJob<T> = { value?: T; error?: unknown };

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const timer = setTimeout(() => { signal.removeEventListener("abort", stop); resolve(); }, ms);
    function stop() { clearTimeout(timer); reject(signal.reason); }
    signal.addEventListener("abort", stop, { once: true });
  });
}

/** POSTs one segment; retries only the transient concurrency 429, never daily/budget limits. */
export async function requestSpeech(text: string, signal: AbortSignal, post: (text: string, signal: AbortSignal) => Promise<Response>,
  delays: number[] = SPEECH_RETRY_DELAYS_MS): Promise<Response> {
  for (let attempt = 0; ; attempt += 1) {
    const response = await post(text, signal);
    if (response.ok) return response;
    const payload = await response.json().catch(() => ({})) as { error?: string };
    const message = payload.error || `Speech generation failed (${response.status})`;
    if (response.status === 429 && BUSY.test(message) && attempt < delays.length) {
      await sleep(delays[attempt], signal);
      continue;
    }
    throw new Error(message);
  }
}

/** Starts item N+1 only after item N has settled; stops after the first failure. */
export function sequentialJobs<I, T>(items: I[], load: (item: I, index: number) => Promise<T>): Promise<SpeechJob<T>>[] {
  const jobs: Promise<SpeechJob<T>>[] = [];
  let previous: Promise<SpeechJob<T>> = Promise.resolve({});
  items.forEach((item, index) => {
    const job = previous.then(async (prior): Promise<SpeechJob<T>> => {
      if (prior.error !== undefined) return { error: prior.error };
      try { return { value: await load(item, index) }; } catch (error) { return { error }; }
    });
    jobs.push(job);
    previous = job;
  });
  return jobs;
}
