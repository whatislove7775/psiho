"use client";

/**
 * On-device speech recognition for captions and voice-message transcripts.
 *
 * Engine: Vosk (Kaldi) compiled to WebAssembly — npm `vosk-browser`
 * (Apache-2.0) with the small Russian model `vosk-model-small-ru` (Apache-2.0,
 * ~45 MB). The model is served from our own origin (/stt/, fetched at docker
 * build — see apps/web/Dockerfile) and cached by vosk-browser in IndexedDB, so
 * it downloads once per device. Audio is recognised in a Web Worker on the
 * speaker's own device; only the resulting text is ever sent anywhere.
 *
 * If /stt/manifest.json is missing (model not installed) every entry point
 * reports "unavailable" and the UI hides the feature.
 */
import type { KaldiRecognizer, Model } from "vosk-browser";

export interface SttManifest {
  lang: string;
  /** URL of the gzipped model tarball (same origin) */
  model: string;
  bytes?: number;
  version?: string;
}

export type SttLoad = "idle" | "loading" | "ready" | "error";

const MANIFEST_URL = "/stt/manifest.json";
const SAMPLE_RATE = 16000;
const LOAD_TIMEOUT_MS = 180_000;

let manifestP: Promise<SttManifest | null> | null = null;
let modelP: Promise<Model> | null = null;
let loadState: SttLoad = "idle";
const loadListeners = new Set<(s: SttLoad) => void>();

function setLoad(s: SttLoad) {
  loadState = s;
  loadListeners.forEach((f) => f(s));
}

const READY_KEY = "aprosop.sttReady";
/** The model was loaded on this device before (so it is cached — no big download). */
export function sttWasReady(): boolean {
  try {
    return localStorage.getItem(READY_KEY) === "1";
  } catch {
    return false;
  }
}

export function sttLoadState(): SttLoad {
  return loadState;
}

export function onSttLoad(f: (s: SttLoad) => void): () => void {
  loadListeners.add(f);
  return () => loadListeners.delete(f);
}

/** Whether recognition can run in this browser (and the model is installed on the server). */
export function sttManifest(): Promise<SttManifest | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (!manifestP) {
    const capable =
      typeof WebAssembly === "object" &&
      typeof Worker !== "undefined" &&
      typeof indexedDB !== "undefined" &&
      !!(window.AudioContext || (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext);
    manifestP = !capable
      ? Promise.resolve(null)
      : fetch(MANIFEST_URL, { cache: "no-cache" })
          .then((r) => (r.ok ? r.json() : null))
          .then((m: SttManifest | null) => (m && typeof m.model === "string" ? m : null))
          .catch(() => null);
  }
  return manifestP;
}

/** Loads (once per page) the recognition model; the first time per device it downloads ~45 MB. */
export function loadModel(): Promise<Model> {
  if (modelP) return modelP;
  setLoad("loading");
  modelP = (async () => {
    const m = await sttManifest();
    if (!m) throw new Error("stt unavailable");
    const { Model } = await import("vosk-browser");
    const model = new Model(new URL(m.model, window.location.href).toString(), -1);
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("stt load timeout")), LOAD_TIMEOUT_MS);
      model.on("load", (msg) => {
        clearTimeout(t);
        if ("result" in msg && msg.result) resolve();
        else reject(new Error("stt load failed"));
      });
      model.on("error", () => {
        clearTimeout(t);
        reject(new Error("stt load failed"));
      });
    });
    return model;
  })();
  modelP.then(
    () => {
      setLoad("ready");
      try {
        localStorage.setItem(READY_KEY, "1");
      } catch {
        /* ignore */
      }
    },
    () => {
      modelP = null; // allow a retry later
      setLoad("error");
    },
  );
  return modelP;
}

export interface RecognitionResult {
  text: string;
  final: boolean;
}

function newRecognizer(model: Model, onResult: (r: RecognitionResult) => void): KaldiRecognizer {
  const rec = new model.KaldiRecognizer(SAMPLE_RATE);
  rec.on("partialresult", (m) => {
    if (m.event === "partialresult") onResult({ text: m.result.partial ?? "", final: false });
  });
  rec.on("result", (m) => {
    if (m.event === "result") onResult({ text: m.result.text ?? "", final: true });
  });
  return rec;
}

const audioCtor = () =>
  window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

/**
 * Live recognition of a microphone track. Call with the ORIGINAL microphone
 * (before any voice filter): better accuracy, and the audio never leaves the
 * device anyway. Returns a stop function; `onResult` gets partials while
 * someone speaks and a final per utterance.
 */
export async function startRecognition(
  track: MediaStreamTrack,
  onResult: (r: RecognitionResult) => void,
): Promise<{ stop: () => void; flush: () => void }> {
  const model = await loadModel();
  const Ctx = audioCtor();
  if (!Ctx) throw new Error("no AudioContext");
  const ctx = new Ctx({ latencyHint: "playback" });
  const rec = newRecognizer(model, onResult);
  // own clone: independent of mute flags on the call's track, stopped with recognition
  const own = track.clone();
  own.enabled = true;
  const src = ctx.createMediaStreamSource(new MediaStream([own]));
  const sink = ctx.createGain();
  sink.gain.value = 0;
  sink.connect(ctx.destination);
  let stopped = false;
  let node: AudioNode;
  let tap: AudioWorkletNode | null = null;
  const feed = (chunk: Float32Array) => {
    if (stopped) return;
    try {
      rec.acceptWaveformFloat(chunk, SAMPLE_RATE);
    } catch {
      /* worker gone */
    }
  };
  try {
    if (!ctx.audioWorklet) throw new Error("no worklet");
    await ctx.audioWorklet.addModule("/audio/pcm-tap.worklet.js");
    tap = new AudioWorkletNode(ctx, "pcm-tap", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
    tap.port.onmessage = (e) => feed(e.data as Float32Array);
    node = tap;
  } catch {
    // Legacy path: ScriptProcessor on the main thread + the same box-filter resampler.
    const sp = ctx.createScriptProcessor(4096, 1, 1);
    const ratio = ctx.sampleRate / SAMPLE_RATE;
    let pos = 0, acc = 0, accN = 0;
    sp.onaudioprocess = (e) => {
      const ch = e.inputBuffer.getChannelData(0);
      const out: number[] = [];
      for (let i = 0; i < ch.length; i++) {
        acc += ch[i];
        accN++;
        if (++pos >= ratio) {
          pos -= ratio;
          out.push(acc / accN);
          acc = 0;
          accN = 0;
        }
      }
      feed(Float32Array.from(out));
    };
    node = sp;
  }
  src.connect(node);
  node.connect(sink);
  if (ctx.state === "suspended") ctx.resume().catch(() => undefined);
  const resume = () => ctx.state === "suspended" && ctx.resume().catch(() => undefined);
  document.addEventListener("pointerdown", resume);
  return {
    /** end the current utterance now (emits its final result) */
    flush: () => {
      if (!stopped) rec.retrieveFinalResult();
    },
    stop: () => {
      if (stopped) return;
      stopped = true;
      document.removeEventListener("pointerdown", resume);
      tap?.port.postMessage("stop");
      try {
        src.disconnect();
        node.disconnect();
      } catch {
        /* already */
      }
      ctx.close().catch(() => undefined);
      own.stop();
      try {
        rec.remove();
      } catch {
        /* worker gone */
      }
    },
  };
}

/**
 * Transcribes a recorded clip (a voice message) on this device.
 * Decodes the file, resamples it to 16 kHz with an OfflineAudioContext and
 * runs it through a fresh recogniser. Resolves with the whole text ("" if
 * nothing was recognised).
 */
export async function transcribeBlob(blob: Blob, onProgress?: (text: string) => void): Promise<string> {
  const model = await loadModel();
  const buf = await blob.arrayBuffer();
  const OfflineCtx = window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  const decoder = new OfflineCtx(1, 1, SAMPLE_RATE);
  const decoded = await decoder.decodeAudioData(buf);
  // decodeAudioData resamples to the context rate; mix down to mono
  const off = new OfflineCtx(1, Math.max(1, Math.ceil(decoded.duration * SAMPLE_RATE)), SAMPLE_RATE);
  const node = off.createBufferSource();
  node.buffer = decoded;
  node.connect(off.destination);
  node.start();
  const pcm = (await off.startRendering()).getChannelData(0);

  const parts: string[] = [];
  const CHUNK = 8000; // 0.5 s
  const chunks = Math.ceil(pcm.length / CHUNK);
  return new Promise<string>((resolve, reject) => {
    let events = 0;
    const timer = setTimeout(() => {
      rec.remove();
      reject(new Error("transcribe timeout"));
    }, 30_000 + decoded.duration * 3000);
    const rec = newRecognizer(model, ({ text, final }) => {
      events++;
      if (final && text) {
        parts.push(text);
        onProgress?.(parts.join(" "));
      }
      // one event per chunk + one for retrieveFinalResult → done
      if (events >= chunks + 1) {
        clearTimeout(timer);
        rec.remove();
        resolve(parts.join(" ").trim());
      }
    });
    for (let i = 0; i < chunks; i++) rec.acceptWaveformFloat(pcm.slice(i * CHUNK, (i + 1) * CHUNK), SAMPLE_RATE);
    rec.retrieveFinalResult();
  });
}
