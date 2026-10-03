"use client";

import { t as tt } from "@/lib/i18n";
import { useCallback, useEffect, useRef, useState } from "react";
import { useVoiceTransform, type VoicePreset } from "@/hooks/useVoiceTransform";
import { loadModel, sttManifest, startRecognition, sttWasReady } from "@/lib/captions/engine";

export type RecorderPhase = "idle" | "opening" | "ready" | "recording" | "review" | "error";

export interface VoiceClip {
  blob: Blob;
  url: string;
  durationMs: number;
  peaks: number[];
  filename: string;
  /** recognised on this device from the ORIGINAL voice (before the mask), if «Текст» is on */
  transcript?: string;
}

const TEXT_KEY = "aprosop.voiceText";

const BARS = 48;
const MAX_MS = 10 * 60 * 1000;

function pickMime(): { mime: string; ext: string } {
  const candidates: [string, string][] = [
    ["audio/webm;codecs=opus", "webm"],
    ["audio/webm", "webm"],
    ["audio/ogg;codecs=opus", "ogg"],
    ["audio/mp4", "m4a"],
  ];
  if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported) {
    for (const [m, ext] of candidates) if (MediaRecorder.isTypeSupported(m)) return { mime: m, ext };
  }
  return { mime: "", ext: "webm" };
}

function downsample(levels: number[], bars = BARS): number[] {
  if (!levels.length) return new Array(bars).fill(0.08);
  const out: number[] = [];
  const step = levels.length / bars;
  for (let i = 0; i < bars; i++) {
    const from = Math.floor(i * step);
    const to = Math.max(from + 1, Math.floor((i + 1) * step));
    let peak = 0;
    for (let j = from; j < to && j < levels.length; j++) peak = Math.max(peak, levels[j]);
    out.push(peak);
  }
  const max = Math.max(...out, 0.001);
  return out.map((v) => Math.max(0.06, Math.min(1, v / max)));
}

/**
 * Microphone → (optional voice mask via useVoiceTransform) → MediaRecorder.
 * The recorded file already contains the masked voice, so the original
 * never leaves the device.
 */
export function useVoiceRecorder() {
  const [phase, setPhase] = useState<RecorderPhase>("idle");
  const [preset, setPreset] = useState<VoicePreset>(() => {
    try {
      const v = localStorage.getItem("aprosop.voiceMask") as VoicePreset | null;
      return v === "lower" || v === "higher" || v === "off" ? v : "lower";
    } catch {
      return "lower";
    }
  });
  const [mic, setMic] = useState<MediaStream | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [live, setLive] = useState<number[]>([]);
  const [clip, setClip] = useState<VoiceClip | null>(null);
  const [error, setError] = useState<string | null>(null);
  // «Приложить текст»: on-device transcript of the original voice (lib/captions); hidden when unavailable
  const [sttOk, setSttOk] = useState(false);
  const [withText, setWithTextState] = useState(false);
  const stt = useRef<{ stop: () => void; flush: () => void } | null>(null);
  const finals = useRef<string[]>([]);
  useEffect(() => {
    let alive = true;
    sttManifest().then((m) => alive && setSttOk(!!m));
    try {
      const v = localStorage.getItem(TEXT_KEY);
      // default: on once the model is already on this device (no surprise 45 MB download)
      setWithTextState(v === null ? sttWasReady() : v === "1");
    } catch {
      /* ignore */
    }
    return () => {
      alive = false;
    };
  }, []);
  const setWithText = useCallback((on: boolean) => {
    setWithTextState(on);
    try {
      localStorage.setItem(TEXT_KEY, on ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  const { transformedStream } = useVoiceTransform({ inputStream: mic, preset });

  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const levels = useRef<number[]>([]);
  const started = useRef(0);
  const raf = useRef<number | null>(null);
  const meterCtx = useRef<AudioContext | null>(null);
  const discardRef = useRef(false);

  useEffect(() => {
    try {
      localStorage.setItem("aprosop.voiceMask", preset);
    } catch {
      /* ignore */
    }
  }, [preset]);

  const stopMeter = () => {
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = null;
    meterCtx.current?.close().catch(() => undefined);
    meterCtx.current = null;
  };

  const releaseMic = useCallback(() => {
    setMic((m) => {
      m?.getTracks().forEach((t) => t.stop());
      return null;
    });
  }, []);

  const open = useCallback(async () => {
    setError(null);
    setPhase("opening");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      setMic(stream);
      setPhase("ready");
      if (withText && sttOk) loadModel().catch(() => undefined); // be ready before the first word
    } catch {
      setError(tt("Нет доступа к\u00a0микрофону. Разрешите его в\u00a0настройках браузера."));
      setPhase("error");
    }
  }, [withText, sttOk]);

  const start = useCallback(() => {
    const stream = transformedStream;
    if (!stream || typeof MediaRecorder === "undefined") {
      setError(tt("Запись голоса не\u00a0поддерживается в\u00a0этом браузере."));
      setPhase("error");
      return;
    }
    const { mime, ext } = pickMime();
    let rec: MediaRecorder;
    try {
      rec = mime ? new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 48000 }) : new MediaRecorder(stream);
    } catch {
      setError(tt("Не\u00a0получилось начать запись."));
      setPhase("error");
      return;
    }
    chunks.current = [];
    levels.current = [];
    discardRef.current = false;
    rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    rec.onstop = async () => {
      stopMeter();
      const durationMs = Date.now() - started.current;
      // let the recogniser close the last phrase (≤ 1.5 s), then release the mic
      const s = stt.current;
      stt.current = null;
      if (s && !discardRef.current) {
        const n = finals.current.length;
        s.flush();
        for (let i = 0; i < 15 && finals.current.length === n; i++) await new Promise((r) => setTimeout(r, 100));
      }
      s?.stop();
      releaseMic();
      if (discardRef.current) {
        setPhase("idle");
        return;
      }
      const type = rec.mimeType || mime || "audio/webm";
      const blob = new Blob(chunks.current, { type });
      const filename = `voice.${type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : ext}`;
      const transcript = s ? finals.current.join(" ").replace(/\s+/g, " ").trim() || undefined : undefined;
      setClip({ blob, url: URL.createObjectURL(blob), durationMs, peaks: downsample(levels.current), filename, transcript });
      setPhase("review");
    };
    finals.current = [];
    const raw = mic?.getAudioTracks()[0];
    if (withText && sttOk && raw) {
      startRecognition(raw, ({ text, final }) => {
        if (final && text) finals.current.push(text);
      })
        .then((s) => {
          if (recRef.current === rec && rec.state === "recording") stt.current = s;
          else s.stop();
        })
        .catch(() => undefined);
    }
    recRef.current = rec;

    // Level meter for the live waveform and stored peaks
    try {
      const ctx = new AudioContext();
      meterCtx.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      src.connect(an);
      const buf = new Uint8Array(an.fftSize);
      let last = 0;
      const tick = (t: number) => {
        an.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / buf.length);
        if (t - last > 60) {
          last = t;
          levels.current.push(rms);
          setLive((xs) => [...xs.slice(-39), Math.min(1, rms * 4)]);
          const ms = Date.now() - started.current;
          setElapsed(ms);
          if (ms >= MAX_MS) recRef.current?.state === "recording" && recRef.current.stop();
        }
        raf.current = requestAnimationFrame(tick);
      };
      raf.current = requestAnimationFrame(tick);
    } catch {
      /* meter is optional */
    }
    started.current = Date.now();
    setElapsed(0);
    setLive([]);
    rec.start(250);
    setPhase("recording");
  }, [transformedStream, releaseMic, mic, withText, sttOk]);

  const stop = useCallback(() => {
    if (recRef.current?.state === "recording") recRef.current.stop();
  }, []);

  const reset = useCallback(() => {
    discardRef.current = true;
    if (recRef.current?.state === "recording") recRef.current.stop();
    else {
      stopMeter();
      releaseMic();
    }
    setClip((c) => {
      if (c) URL.revokeObjectURL(c.url);
      return null;
    });
    setElapsed(0);
    setLive([]);
    setError(null);
    setPhase("idle");
  }, [releaseMic]);

  useEffect(
    () => () => {
      discardRef.current = true;
      if (recRef.current?.state === "recording") recRef.current.stop();
      stopMeter();
    },
    [],
  );
  useEffect(() => () => mic?.getTracks().forEach((t) => t.stop()), [mic]);

  return {
    phase,
    preset,
    setPreset,
    elapsed,
    live,
    clip,
    error,
    ready: !!transformedStream,
    /** null → on-device transcription isn't available here */
    withText: sttOk ? withText : null,
    setWithText,
    open,
    start,
    stop,
    reset,
  };
}
