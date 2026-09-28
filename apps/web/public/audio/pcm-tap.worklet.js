/*
 * pcm-tap — feeds on-device speech recognition (lib/captions/engine.ts).
 * Takes the microphone input at the context rate, low-passes + resamples it
 * to 16 kHz mono and posts ~100 ms Float32Array chunks to the main thread.
 * Produces no audio output. Nothing here leaves the device.
 */
class PcmTap extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / 16000;
    this.pos = 0; // fractional read position into the incoming stream
    this.acc = 0;
    this.accN = 0;
    this.chunk = new Float32Array(1600);
    this.n = 0;
    this.on = true;
    this.port.onmessage = (e) => {
      if (e.data === "stop") this.on = false;
    };
  }

  process(inputs) {
    if (!this.on) return false;
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    // box filter over each output period (cheap anti-alias) → one 16 kHz sample
    for (let i = 0; i < ch.length; i++) {
      this.acc += ch[i];
      this.accN++;
      this.pos += 1;
      if (this.pos >= this.ratio) {
        this.pos -= this.ratio;
        this.chunk[this.n++] = this.acc / this.accN;
        this.acc = 0;
        this.accN = 0;
        if (this.n === this.chunk.length) {
          this.port.postMessage(this.chunk, [this.chunk.buffer]);
          this.chunk = new Float32Array(1600);
          this.n = 0;
        }
      }
    }
    return true;
  }
}

registerProcessor("pcm-tap", PcmTap);
