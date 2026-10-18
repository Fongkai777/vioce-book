import { pcmWav, VoiceDetector } from "./voice-turn.ts";

type Callbacks = { level: (level: number) => void; start: () => void; utterance: (file: File, seconds: number) => void; stopped: (reason: string) => void; playback: () => boolean };
export class VoiceCapture {
  private detector: VoiceDetector;
  private source: MediaStreamAudioSourceNode;
  private node: AudioWorkletNode;
  private gain: GainNode;
  private idle: ReturnType<typeof setTimeout> | undefined;
  private closed = false;
  private muted = false;
  private constructor(private stream: MediaStream, private context: AudioContext, private callbacks: Callbacks) {
    this.detector = new VoiceDetector(context.sampleRate);
    this.source = context.createMediaStreamSource(stream);
    this.node = new AudioWorkletNode(context, "voicebook-capture");
    this.gain = context.createGain(); this.gain.gain.value = 0;
    this.source.connect(this.node); this.node.connect(this.gain); this.gain.connect(context.destination);
    this.node.port.onmessage = event => {
      if (this.closed || this.muted) return;
      const result = this.detector.push(event.data as Float32Array, callbacks.playback());
      callbacks.level(result.level);
      if (result.started) { this.armIdle(); callbacks.start(); }
      if (result.utterance) this.deliver(result.utterance);
    };
    for (const track of stream.getAudioTracks()) track.onended = () => this.stop("Microphone disconnected. Start voice again to reconnect.");
    this.node.onprocessorerror = () => this.stop("Microphone processing stopped. Please start voice again.");
    this.armIdle();
  }
  static async open(context: AudioContext, callbacks: Callbacks) {
    if (!context.audioWorklet || !navigator.mediaDevices?.getUserMedia) throw new Error("This browser does not support voice mode. Please use a current browser with microphone support.");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
    try { await context.audioWorklet.addModule("/voice-capture-worklet.js"); return new VoiceCapture(stream, context, callbacks); }
    catch (error) { stream.getTracks().forEach(track => track.stop()); throw error; }
  }
  private armIdle() {
    if (this.idle) clearTimeout(this.idle);
    this.idle = setTimeout(() => this.stop("Voice mode ended after 90 seconds without new speech."), 90000);
  }
  private deliver(samples: Float32Array) {
    this.armIdle();
    const file = new File([pcmWav(samples, this.context.sampleRate)], "question.wav", { type: "audio/wav" });
    this.callbacks.utterance(file, Math.min(60, Math.max(1, Math.ceil(samples.length / this.context.sampleRate))));
  }
  finish() { const samples = this.detector.flush(); if (samples) this.deliver(samples); }
  get speaking() { return this.detector.speaking; }
  mute(value: boolean) {
    this.muted = value; this.detector.reset(); this.callbacks.level(0);
    this.stream.getAudioTracks().forEach(track => { track.enabled = !value; });
    this.armIdle();
  }
  stop(reason = "") {
    if (this.closed) return;
    this.closed = true; if (this.idle) clearTimeout(this.idle);
    this.node.port.onmessage = null; this.node.onprocessorerror = null; this.node.port.close();
    this.stream.getTracks().forEach(track => { track.onended = null; track.stop(); });
    this.source.disconnect(); this.node.disconnect(); this.gain.disconnect(); this.detector.reset();
    this.callbacks.level(0); if (reason) this.callbacks.stopped(reason);
  }
}
