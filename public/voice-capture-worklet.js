// Audio is only transferred to this page's local turn detector, never to a service.
class VoicebookCapture extends AudioWorkletProcessor {
  constructor() { super(); this.frame = new Float32Array(2048); this.offset = 0; }
  process(inputs) {
    const input = inputs[0]?.[0];
    if (input) for (let i = 0; i < input.length; i++) {
      this.frame[this.offset++] = input[i];
      if (this.offset === this.frame.length) {
        this.port.postMessage(this.frame, [this.frame.buffer]);
        this.frame = new Float32Array(2048); this.offset = 0;
      }
    }
    return true;
  }
}
registerProcessor("voicebook-capture", VoicebookCapture);
