// Pause only the output source, never the AudioContext shared with microphone
// capture. Empty ASR can resume at the same sample position without a new TTS call.
export class PausableAudio {
  private node: AudioBufferSourceNode | null = null;
  private offset = 0;
  private startedAt = 0;
  private done = false;
  private finish: (error?: unknown) => void = () => {};
  private context: AudioContext;
  private buffer: AudioBuffer;
  private onNode: (node: AudioBufferSourceNode | null) => void;
  constructor(context: AudioContext, buffer: AudioBuffer,
    onNode: (node: AudioBufferSourceNode | null) => void) {
    this.context = context; this.buffer = buffer; this.onNode = onNode;
  }

  play(signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    return new Promise((resolve, reject) => {
      const abort = () => this.finish(new DOMException("Cancelled", "AbortError"));
      this.finish = error => {
        if (this.done) return;
        this.done = true; signal.removeEventListener("abort", abort); this.detach();
        if (error) reject(error); else resolve();
      };
      signal.addEventListener("abort", abort, { once: true });
      this.resume();
    });
  }
  private detach() {
    const node = this.node; this.node = null;
    if (!node) return;
    node.onended = null;
    try { node.stop(); } catch { /* Already ended. */ }
    node.disconnect(); this.onNode(null);
  }
  pause() {
    if (!this.node || this.done) return false;
    this.offset = Math.min(this.buffer.duration, this.offset + Math.max(0, this.context.currentTime - this.startedAt));
    this.detach(); return true;
  }
  resume() {
    if (this.done || this.node) return;
    if (this.offset >= this.buffer.duration) { this.finish(); return; }
    try {
      if (this.context.state !== "running") throw new Error("Audio playback is paused by your browser. Tap Play saved audio to listen.");
      const node = this.context.createBufferSource(); this.node = node;
      node.buffer = this.buffer; node.connect(this.context.destination);
      node.onended = () => this.finish(); this.startedAt = this.context.currentTime;
      this.onNode(node); node.start(0, this.offset);
    } catch (error) { this.finish(error); }
  }
}
