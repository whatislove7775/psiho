/* eslint-disable */
/**
 * aprosop voice shifter — AudioWorklet, TD-PSOLA with formant control.
 *
 * Pitch-synchronous overlap-add: the voice is cut into two-period Hann grains
 * at pitch marks spaced one detected period apart (YIN on a 4× decimated
 * copy), and the grains are laid out again at a new spacing. Because every
 * grain keeps its own spectral envelope, the pitch changes while the formants
 * (what makes a voice sound human, not chipmunk/robot) stay put. Resampling
 * each grain by `formant` then moves the envelope separately, e.g. a slightly
 * smaller/larger "vocal tract".
 *
 * Unvoiced sounds (s, f, sh, breath) are passed through the same grain engine
 * with ratio 1, so switching between voiced and unvoiced never clicks.
 *
 * Latency: a fixed 30 ms lookahead (enough for 80 Hz voices with 0.9×
 * formants) plus one 128-sample render quantum. CPU: YIN ≈ 20k MACs every
 * 256 samples + one grain per output period — a few % of one core.
 *
 * Messages (port): { pitch, formant, robotHz, neutralHz, soft }
 *   pitch     output/input pitch ratio (1 = unchanged)
 *   formant   spectral-envelope scale (1 = unchanged)
 *   robotHz   >0: voiced parts at this constant pitch (monotone)
 *   neutralHz >0: pitch pulled toward this frequency whatever the speaker's
 *             own pitch is (gender-ambiguous voice); `formant` then follows
 *   soft      0…1 gentle high-frequency roll-off
 */
const N = 1 << 15; // ring size (≈ 0.68 s at 48 kHz)
const MASK = N - 1;
const DEC = 4; // decimation for pitch detection
const DN = 1 << 13;
const DMASK = DN - 1;

class VoiceShifter extends AudioWorkletProcessor {
  constructor() {
    super();
    const sr = sampleRate;
    this.sr = sr;
    this.inp = new Float32Array(N);
    this.acc = new Float32Array(N);
    this.norm = new Float32Array(N);
    this.dec = new Float32Array(DN);
    this.w = 0; // absolute write position (samples)
    this.dw = 0; // decimated write position
    this.lp = 0;
    this.decSum = 0;
    this.decN = 0;
    this.sinceDetect = 0;

    this.minF0 = 80;
    this.maxF0 = 420;
    this.hMax = Math.round(0.01 * sr); // grain half-width cap (10 ms)
    this.unvoicedT = Math.round(0.005 * sr); // pseudo-period for unvoiced (5 ms)
    this.delay = Math.ceil(0.03 * sr); // fixed lookahead
    this.T0 = this.unvoicedT;
    this.voiced = false;
    this.voicedHold = 0;

    // analysis marks (ring)
    this.mPos = new Float64Array(256);
    this.mT = new Float32Array(256);
    this.mV = new Uint8Array(256);
    this.mCount = 0; // total marks placed
    this.nextA = this.hMax * 2;
    this.nextS = this.hMax * 2;
    this.mIdx = 0; // search pointer (absolute mark index)

    this.params = { pitch: 1, formant: 1, robotHz: 0, neutralHz: 0, soft: 0 };
    this.lpOut = 0;
    this.port.onmessage = (e) => Object.assign(this.params, e.data || {});
  }

  /** YIN on the last decimated samples → sets this.T0 / this.voiced. */
  detect() {
    const dsr = this.sr / DEC;
    const tauMax = Math.ceil(dsr / this.minF0);
    const tauMin = Math.floor(dsr / this.maxF0);
    const W = tauMax;
    const start = this.dw - (W + tauMax);
    if (start < 0) return;
    const d = this.dec;
    let energy = 0;
    for (let j = 0; j < W + tauMax; j++) {
      const x = d[(start + j) & DMASK];
      energy += x * x;
    }
    const rms = Math.sqrt(energy / (W + tauMax));
    let best = -1;
    let bestVal = 1;
    let cum = 0;
    const cmnd = this.cmnd || (this.cmnd = new Float32Array(tauMax + 2));
    for (let tau = 1; tau <= tauMax; tau++) {
      let sum = 0;
      for (let j = 0; j < W; j++) {
        const diff = d[(start + j) & DMASK] - d[(start + j + tau) & DMASK];
        sum += diff * diff;
      }
      cum += sum;
      cmnd[tau] = cum > 0 ? (sum * tau) / cum : 1;
    }
    for (let tau = tauMin; tau < tauMax; tau++) {
      if (cmnd[tau] < 0.15) {
        while (tau + 1 < tauMax && cmnd[tau + 1] < cmnd[tau]) tau++;
        best = tau;
        bestVal = cmnd[tau];
        break;
      }
      if (cmnd[tau] < bestVal) {
        bestVal = cmnd[tau];
        best = tau;
      }
    }
    const voiced = best > 0 && bestVal < 0.3 && rms > 0.004;
    if (voiced) {
      // parabolic refinement
      let t = best;
      if (best > 1 && best < tauMax) {
        const a = cmnd[best - 1], b = cmnd[best], c = cmnd[best + 1];
        const den = a - 2 * b + c;
        if (den > 1e-9) t = best + (0.5 * (a - c)) / den;
      }
      const T = Math.min(t * DEC, this.sr / this.minF0);
      // smooth small changes, follow real jumps (octave errors are rare with the 0.15 threshold)
      this.T0 = this.voiced && Math.abs(T - this.T0) < 0.2 * this.T0 ? 0.6 * this.T0 + 0.4 * T : T;
      this.voiced = true;
      this.voicedHold = 3;
    } else if (this.voicedHold > 0) {
      this.voicedHold--; // bridge short dropouts inside a vowel
    } else {
      this.voiced = false;
      this.T0 = this.unvoicedT;
    }
  }

  /** Place analysis marks one period apart while their grains are fully available. */
  placeMarks() {
    for (;;) {
      const T = this.T0;
      const h = Math.min(T, this.hMax);
      if (this.nextA + h + 2 > this.w) return;
      const k = this.mCount & 255;
      this.mPos[k] = this.nextA;
      this.mT[k] = T;
      this.mV[k] = this.voiced ? 1 : 0;
      this.mCount++;
      this.nextA += T;
    }
  }

  /** Output period and formant factor for a mark. */
  shape(T, voiced) {
    const p = this.params;
    if (!voiced) return [T, p.neutralHz > 0 ? 1 : p.formant];
    if (p.robotHz > 0) return [this.sr / p.robotHz, p.formant];
    if (p.neutralHz > 0) {
      const f0 = this.sr / T;
      const ratio = Math.min(1.45, Math.max(0.7, p.neutralHz / f0));
      const fm = Math.min(1.1, Math.max(0.92, Math.pow(ratio, 0.35)));
      return [T / ratio, fm];
    }
    return [T / p.pitch, p.formant];
  }

  /** Lay synthesis grains while a nearby analysis mark is known. */
  synthesize() {
    if (this.mCount === 0) return;
    const lastK = (this.mCount - 1) & 255;
    const lastPos = this.mPos[lastK];
    const lastT = this.mT[lastK];
    const inp = this.inp, acc = this.acc, norm = this.norm;
    while (this.nextS <= lastPos + lastT / 2) {
      const s = this.nextS;
      // nearest analysis mark to s
      let i = Math.max(this.mIdx, this.mCount - 255);
      while (i + 1 < this.mCount && Math.abs(this.mPos[(i + 1) & 255] - s) <= Math.abs(this.mPos[i & 255] - s)) i++;
      this.mIdx = i;
      const k = i & 255;
      const a = this.mPos[k];
      const T = this.mT[k];
      const voiced = this.mV[k] === 1;
      const [P, f] = this.shape(T, voiced);
      const h = Math.min(T, this.hMax);
      const ho = h / f;
      const s0 = Math.ceil(s - ho), s1 = Math.floor(s + ho);
      const inv = Math.PI / ho;
      for (let n = s0; n <= s1; n++) {
        const x = n - s; // output offset
        const wv = 0.5 + 0.5 * Math.cos(x * inv);
        const src = a + x * f;
        const i0 = Math.floor(src);
        const fr = src - i0;
        const v = inp[i0 & MASK] * (1 - fr) + inp[(i0 + 1) & MASK] * fr;
        acc[n & MASK] += v * wv;
        norm[n & MASK] += wv;
      }
      this.nextS += Math.max(P, 8);
    }
  }

  process(inputs, outputs) {
    const input = inputs[0] && inputs[0][0];
    const out = outputs[0];
    const o = out && out[0];
    if (!o) return true;
    const len = o.length;
    const inp = this.inp;
    const aLP = 1 - Math.exp((-2 * Math.PI * 1000) / this.sr);
    for (let i = 0; i < len; i++) {
      const x = input ? input[i] : 0;
      inp[this.w & MASK] = x;
      this.w++;
      // decimated copy for pitch detection
      this.lp += aLP * (x - this.lp);
      this.decSum += this.lp;
      if (++this.decN === DEC) {
        this.dec[this.dw & DMASK] = this.decSum / DEC;
        this.dw++;
        this.decSum = 0;
        this.decN = 0;
      }
      if (++this.sinceDetect >= 256) {
        this.sinceDetect = 0;
        this.detect();
        this.placeMarks();
        this.synthesize();
      }
    }
    this.placeMarks();
    this.synthesize();

    const acc = this.acc, norm = this.norm;
    const soft = this.params.soft;
    const aSoft = 1 - Math.exp((-2 * Math.PI * 3200) / this.sr);
    let r = this.w - len - this.delay;
    for (let i = 0; i < len; i++, r++) {
      if (r < 0) {
        o[i] = 0;
        continue;
      }
      const k = r & MASK;
      const nv = norm[k];
      let y = nv > 1 ? acc[k] / nv : acc[k];
      acc[k] = 0;
      norm[k] = 0;
      if (soft > 0) {
        this.lpOut += aSoft * (y - this.lpOut);
        y = y * (1 - soft) + this.lpOut * soft * 1.08;
      }
      o[i] = y > 1 ? 1 : y < -1 ? -1 : y;
    }
    for (let c = 1; c < out.length; c++) out[c].set(o);
    return true;
  }
}

registerProcessor("voice-shifter", VoiceShifter);
