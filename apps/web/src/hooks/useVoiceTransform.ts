"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Voice presets. "lower"/"higher" keep their old ids (stored in localStorage
 * by the chat voice recorder and used in older UIs).
 */
export type VoicePreset = "off" | "lower" | "higher" | "soft" | "neutral" | "robot";

export const VOICE_PRESETS: { value: VoicePreset; label: string; hint: string }[] = [
  { value: "off", label: "Без фильтра", hint: "Ваш настоящий голос" },
  { value: "lower", label: "Ниже", hint: "Голос ниже, тембр естественный" },
  { value: "higher", label: "Выше", hint: "Голос выше, без «мультяшности»" },
  { value: "soft", label: "Мягкий", hint: "Чуть выше и теплее, сглаженные верха" },
  { value: "neutral", label: "Нейтральный", hint: "Средняя высота: не понять, мужской или женский" },
  { value: "robot", label: "Робот", hint: "Ровный механический голос, шутки ради" },
];

/** Worklet parameters per preset (see public/audio/voice-shifter.worklet.js). */
const PARAMS: Record<Exclude<VoicePreset, "off">, { pitch: number; formant: number; robotHz: number; neutralHz: number; soft: number }> = {
  lower: { pitch: 0.8, formant: 0.92, robotHz: 0, neutralHz: 0, soft: 0 },
  higher: { pitch: 1.25, formant: 1.07, robotHz: 0, neutralHz: 0, soft: 0 },
  soft: { pitch: 1.06, formant: 0.97, robotHz: 0, neutralHz: 0, soft: 0.5 },
  neutral: { pitch: 1, formant: 1, robotHz: 0, neutralHz: 165, soft: 0.15 },
  robot: { pitch: 1, formant: 1, robotHz: 100, neutralHz: 0, soft: 0 },
};

const WORKLET_URL = "/audio/voice-shifter.worklet.js";

interface UseVoiceTransformOptions {
  inputStream: MediaStream | null;
  preset: VoicePreset;
  /** build the audio graph up front so the first switch to a filter is instant (calls) */
  preload?: boolean;
}

interface Graph {
  ctx: AudioContext;
  node: AudioWorkletNode | null;
  /** legacy EQ fallback when AudioWorklet is unavailable */
  eq: BiquadFilterNode[] | null;
  out: MediaStream;
}

function legacyEq(ctx: AudioContext, preset: VoicePreset, nodes: BiquadFilterNode[]) {
  const [lo, pk, hi] = preset === "lower" ? [7, -4, -3] : preset === "higher" || preset === "soft" ? [-6, 3, 5] : [0, 0, 0];
  nodes[0].gain.setTargetAtTime(lo, ctx.currentTime, 0.02);
  nodes[1].gain.setTargetAtTime(pk, ctx.currentTime, 0.02);
  nodes[2].gain.setTargetAtTime(hi, ctx.currentTime, 0.02);
}

/**
 * useVoiceTransform — on-device voice masking for calls and voice messages.
 *
 * A TD-PSOLA pitch shifter with formant control runs in an AudioWorklet
 * (~30 ms latency, ~1–2 % of one core): the pitch moves but the formants stay
 * natural, so voices don't turn into chipmunks or robots (except «Робот»).
 *
 * "off" returns the raw microphone stream (zero added latency). The audio
 * graph is built once per input stream and kept while presets change, so
 * switching filters is instant and doesn't swap the outgoing track.
 * Falls back to the old EQ-only mask where AudioWorklet is missing.
 */
export function useVoiceTransform({ inputStream, preset, preload = false }: UseVoiceTransformOptions) {
  const [transformedStream, setTransformedStream] = useState<MediaStream | null>(null);
  const graphRef = useRef<Graph | null>(null);
  const [graph, setGraph] = useState<Graph | null>(null);
  const wantGraph = !!inputStream && inputStream.getAudioTracks().length > 0 && preset !== "off";
  const [used, setUsed] = useState(false);
  useEffect(() => {
    if (wantGraph || (preload && inputStream)) setUsed(true);
  }, [wantGraph, preload, inputStream]);

  // Build the graph lazily the first time a filter is chosen; keep it for this input.
  useEffect(() => {
    if (!inputStream || !inputStream.getAudioTracks().length || !used) return;
    let cancelled = false;
    let g: Graph | null = null;
    (async () => {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      // No fixed sampleRate: Firefox refuses to connect a mic stream to a context at another rate.
      const ctx = new Ctx({ latencyHint: "interactive" });
      const source = ctx.createMediaStreamSource(new MediaStream(inputStream.getAudioTracks()));
      const dest = ctx.createMediaStreamDestination();
      let node: AudioWorkletNode | null = null;
      let eq: BiquadFilterNode[] | null = null;
      try {
        if (!ctx.audioWorklet) throw new Error("no AudioWorklet");
        await ctx.audioWorklet.addModule(WORKLET_URL);
        if (cancelled) {
          ctx.close().catch(() => undefined);
          return;
        }
        node = new AudioWorkletNode(ctx, "voice-shifter", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
        source.connect(node);
        node.connect(dest);
      } catch {
        if (cancelled) {
          ctx.close().catch(() => undefined);
          return;
        }
        const low = ctx.createBiquadFilter();
        low.type = "lowshelf";
        low.frequency.value = 320;
        const peak = ctx.createBiquadFilter();
        peak.type = "peaking";
        peak.frequency.value = 1000;
        peak.Q.value = 1.2;
        const high = ctx.createBiquadFilter();
        high.type = "highshelf";
        high.frequency.value = 2500;
        source.connect(low);
        low.connect(peak);
        peak.connect(high);
        high.connect(dest);
        eq = [low, peak, high];
      }
      if (ctx.state === "suspended") ctx.resume().catch(() => undefined);
      g = { ctx, node, eq, out: new MediaStream(dest.stream.getAudioTracks()) };
      graphRef.current = g;
      setGraph(g);
    })();
    return () => {
      cancelled = true;
      if (g) g.ctx.close().catch(() => undefined);
      graphRef.current = null;
      setGraph(null);
    };
  }, [inputStream, used]);

  // Apply the preset; pick raw vs processed stream.
  useEffect(() => {
    if (!inputStream || !inputStream.getAudioTracks().length || preset === "off") {
      setTransformedStream(inputStream);
      return;
    }
    if (!graph) {
      setTransformedStream(null); // graph is being built (a few ms)
      return;
    }
    if (graph.ctx.state === "suspended") graph.ctx.resume().catch(() => undefined);
    if (graph.node) graph.node.port.postMessage(PARAMS[preset]);
    else if (graph.eq) legacyEq(graph.ctx, preset, graph.eq);
    setTransformedStream(graph.out);
  }, [inputStream, preset, graph]);

  return { transformedStream };
}
