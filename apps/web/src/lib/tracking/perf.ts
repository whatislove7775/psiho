/**
 * Live performance counters of the avatar pipeline
 * (camera frame → face detection → FaceTracker → KitRenderer → outgoing video).
 *
 * Cheap enough to be always on: a few numbers per frame in fixed-size ring
 * buffers. Read by the hidden call overlay (/room/…?debug=1) and exposed as
 * `window.__avatarPerf` for automated tests. Never contains image data.
 */

class Ring {
  private buf: Float64Array;
  private n = 0;
  private i = 0;
  constructor(size = 90) {
    this.buf = new Float64Array(size);
  }
  push(v: number) {
    this.buf[this.i] = v;
    this.i = (this.i + 1) % this.buf.length;
    if (this.n < this.buf.length) this.n++;
  }
  values(): number[] {
    const out: number[] = [];
    for (let k = 0; k < this.n; k++) out.push(this.buf[(this.i - this.n + k + this.buf.length) % this.buf.length]);
    return out;
  }
  clear() {
    this.n = 0;
    this.i = 0;
  }
}

/** Events per second over the last ~2 s. */
function rate(times: number[], now: number): number {
  const recent = times.filter((t) => now - t < 2000);
  if (recent.length < 2) return 0;
  const span = Math.max(now - recent[0], 1);
  return (recent.length / span) * 1000;
}

function stat(values: number[]) {
  if (!values.length) return { mean: 0, p95: 0 };
  const s = [...values].sort((a, b) => a - b);
  return { mean: values.reduce((a, b) => a + b, 0) / values.length, p95: s[Math.min(s.length - 1, Math.floor(s.length * 0.95))] };
}

export interface AvatarPerfSnapshot {
  /** where detection runs: "worker/GPU", "worker/CPU", "main/GPU", "main/CPU" or "—" */
  backend: string;
  camFps: number;
  detectFps: number;
  /** model time per frame (inside the worker, or on the main thread) */
  detectMs: number;
  detectP95: number;
  /** camera frame available → avatar frame rendered and handed to the encoder */
  latencyMs: number;
  latencyP95: number;
  renderFps: number;
  renderMs: number;
  sendFps: number;
  /** camera frames skipped because the detector was still busy */
  dropped: number;
  faces: number;
}

class AvatarPerf {
  backend = "—";
  /** how the detector backend was chosen (worker vs main thread), newest last */
  decision: string[] = [];
  dropped = 0;
  faces = 0;
  private cam = new Ring(120);
  private det = new Ring(120);
  private ren = new Ring(120);
  private snd = new Ring(120);
  private detMs = new Ring(90);
  private lat = new Ring(90);
  private renMs = new Ring(90);

  camFrame(t = performance.now()) {
    this.cam.push(t);
  }
  detected(ms: number, t = performance.now()) {
    this.det.push(t);
    this.detMs.push(ms);
  }
  rendered(t = performance.now()) {
    this.ren.push(t);
  }
  /** time spent rendering one tracked avatar frame */
  renderCost(ms: number) {
    this.renMs.push(ms);
  }
  sent(t = performance.now()) {
    this.snd.push(t);
  }
  /** a tracked frame reached the screen/encoder; `since` is when its camera frame became available */
  latency(since: number, t = performance.now()) {
    if (since > 0 && t >= since) this.lat.push(t - since);
  }
  log(msg: string) {
    this.decision.push(`${(performance.now() / 1000).toFixed(1)}s ${msg}`);
    if (this.decision.length > 20) this.decision.shift();
  }
  reset() {
    this.decision = [];
    [this.cam, this.det, this.ren, this.snd, this.detMs, this.lat, this.renMs].forEach((r) => r.clear());
    this.dropped = 0;
    this.faces = 0;
    this.backend = "—";
  }
  snapshot(): AvatarPerfSnapshot {
    const now = performance.now();
    const d = stat(this.detMs.values());
    const l = stat(this.lat.values());
    const r1 = (x: number) => Math.round(x * 10) / 10;
    return {
      backend: this.backend,
      camFps: r1(rate(this.cam.values(), now)),
      detectFps: r1(rate(this.det.values(), now)),
      detectMs: r1(d.mean),
      detectP95: r1(d.p95),
      latencyMs: r1(l.mean),
      latencyP95: r1(l.p95),
      renderFps: r1(rate(this.ren.values(), now)),
      renderMs: r1(stat(this.renMs.values()).mean),
      sendFps: r1(rate(this.snd.values(), now)),
      dropped: this.dropped,
      faces: this.faces,
    };
  }
}

export const avatarPerf = new AvatarPerf();

if (typeof window !== "undefined") {
  (window as unknown as { __avatarPerf?: AvatarPerf }).__avatarPerf = avatarPerf;
}
