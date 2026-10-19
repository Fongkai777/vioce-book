// Noise can trigger VAD without yielding words. Keep generation alive until
// transcription confirms a new question, and hold playback while listening.
export class VoiceInputGate {
  active = false;
  private listeners = new Set<() => void>();
  begin() { this.active = true; }
  finish() { this.active = false; for (const notify of [...this.listeners]) notify(); }
  async wait(signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    if (!this.active) return;
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => { this.listeners.delete(done); signal.removeEventListener("abort", abort); };
      const done = () => { cleanup(); resolve(); };
      const abort = () => { cleanup(); reject(new DOMException("Cancelled", "AbortError")); };
      this.listeners.add(done); signal.addEventListener("abort", abort, { once: true });
    });
    // A new utterance may begin before the released continuation runs.
    return this.wait(signal);
  }
}
