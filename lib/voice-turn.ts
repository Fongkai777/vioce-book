// Small, deterministic audio/turn primitives shared by the browser and tests.
export class TurnGate {
  private current = new AbortController();
  next() { this.current.abort(); this.current = new AbortController(); return this.current.signal; }
  cancel() { this.current.abort(); }
  get signal() { return this.current.signal; }
}

export function pcmWav(samples: Float32Array, rate: number) {
  const targetRate = 16000, length = Math.floor(samples.length * targetRate / rate);
  const buffer = new ArrayBuffer(44 + length * 2), view = new DataView(buffer);
  const text = (offset: number, value: string) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
  text(0, "RIFF"); view.setUint32(4, 36 + length * 2, true); text(8, "WAVE"); text(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, targetRate, true); view.setUint32(28, targetRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, "data"); view.setUint32(40, length * 2, true);
  for (let i = 0; i < length; i++) {
    const start = Math.floor(i * rate / targetRate), end = Math.max(start + 1, Math.floor((i + 1) * rate / targetRate));
    let value = 0; for (let j = start; j < end && j < samples.length; j++) value += samples[j];
    value = Math.max(-1, Math.min(1, value / (end - start)));
    view.setInt16(44 + i * 2, value < 0 ? value * 32768 : value * 32767, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

export class VoiceDetector {
  private before: Float32Array[] = [];
  private frames: Float32Array[] = [];
  private candidate = 0;
  private silence = 0;
  private duration = 0;
  speaking = false;
  private rate: number;
  constructor(rate: number) { this.rate = rate; }
  reset() { this.before = []; this.frames = []; this.candidate = this.silence = this.duration = 0; this.speaking = false; }
  push(frame: Float32Array, playback = false) {
    let power = 0; for (const n of frame) power += n * n;
    const rms = Math.sqrt(power / frame.length), ms = frame.length / this.rate * 1000;
    const loud = rms >= (playback ? 0.035 : 0.015);
    let started = false;
    if (!this.speaking) {
      this.before.push(frame);
      while (this.before.length > 1 && this.before.reduce((sum, part) => sum + part.length, 0) > this.rate * .45) this.before.shift();
      this.candidate = loud ? this.candidate + ms : 0;
      if (this.candidate >= (playback ? 320 : 160)) {
        this.speaking = true; started = true; this.frames = this.before; this.before = [];
        this.duration = this.frames.reduce((sum, part) => sum + part.length, 0) / this.rate * 1000;
      }
    } else { this.frames.push(frame); this.duration += ms; }
    this.silence = loud ? 0 : this.silence + ms;
    const utterance = this.speaking && (this.silence >= 1100 || this.duration >= 58000) ? this.flush() : undefined;
    return { level: Math.min(1, rms * 12), started, utterance };
  }
  flush() {
    if (!this.speaking) return undefined;
    const length = this.frames.reduce((sum, frame) => sum + frame.length, 0), samples = new Float32Array(length);
    let offset = 0; for (const frame of this.frames) { samples.set(frame, offset); offset += frame.length; }
    this.reset(); return samples;
  }
}

export function speechSegments(text: string) {
  const clean = text.replace(/\[S\d+\]/g, "").replace(/[*#`]/g, "").trim().slice(0, 5000);
  if (clean.length <= 220) return clean ? [clean] : [];
  // A short first phrase reduces time to first audio. The rest is prefetched once.
  const split = clean.slice(50, 220).search(/[。！？.!?\n]/);
  const end = split >= 0 ? 51 + split : Math.max(100, clean.lastIndexOf(" ", 200));
  return [clean.slice(0, end).trim(), clean.slice(end).trim()].filter(Boolean);
}
