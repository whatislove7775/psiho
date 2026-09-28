"use client";

/**
 * Slow-connection guard for the floating hands. Hands need a 7.8 MB model and
 * some CPU; on a slow connection the call matters more, so hands switch off
 * automatically (prefs.reportSlowNetwork → «Руки выключены: медленный интернет»):
 *
 *   1. navigator.connection (Chrome/Android): saveData, effectiveType ≤ 3g, downlink < 1.5 Mbps;
 *   2. otherwise a quick measurement: the first 256 KB of the hand model
 *      (a real part of the download; the rest comes from the HTTP cache or is skipped);
 *   3. during calls: sustained bad call stats (encoder cap / RTT / loss) for ~10 s.
 */
import { useEffect, useRef } from "react";
import { reportSlowNetwork } from "./prefs";

const MODEL = "/mediapipe/hand_landmarker.task";
const PROBE_BYTES = 256 * 1024;
/** below this the model would take > ~40 s */
const MIN_KBPS = 1500;

type NetInfo = { saveData?: boolean; effectiveType?: string; downlink?: number };

/** "slow" / "ok" from the Network Information API, or null when the browser doesn't tell. */
export function connectionVerdict(c: NetInfo | undefined | null = typeof navigator !== "undefined" ? (navigator as Navigator & { connection?: NetInfo }).connection : null): "slow" | "ok" | null {
  if (!c) return null;
  if (c.saveData) return "slow";
  if (c.effectiveType && /^(slow-2g|2g|3g)$/.test(c.effectiveType)) return "slow";
  if (typeof c.downlink === "number" && c.downlink > 0) return c.downlink < MIN_KBPS / 1000 ? "slow" : "ok";
  return c.effectiveType ? "ok" : null;
}

/** Download throughput (kbps) of the first `bytes` of `url`; null if it can't be measured. */
export async function probeKbps(url = MODEL, bytes = PROBE_BYTES, timeoutMs = 6000): Promise<number | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  const t0 = performance.now();
  let got = 0;
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { Range: `bytes=0-${bytes - 1}` } });
    const reader = res.body?.getReader();
    if (!reader) return null;
    while (got < bytes) {
      const { done, value } = await reader.read();
      if (done) break;
      got += value.byteLength;
    }
    reader.cancel().catch(() => undefined);
  } catch {
    // aborted by the timeout: what arrived so far still tells the speed
    if (got < 16 * 1024) return got === 0 && performance.now() - t0 >= timeoutMs - 50 ? 0 : null;
  } finally {
    clearTimeout(timer);
    ctl.abort();
  }
  const s = (performance.now() - t0) / 1000;
  return s > 0 && got > 0 ? (got * 8) / 1000 / s : null;
}

let checked: Promise<"slow" | "ok"> | null = null;

/** Once per page session: decide whether the connection is too slow for hands. */
export function checkNetworkForHands(): Promise<"slow" | "ok"> {
  checked ??= (async () => {
    const v = connectionVerdict();
    if (v === "slow") {
      reportSlowNetwork();
      return "slow";
    }
    if (v === "ok") return "ok";
    const kbps = await probeKbps().catch(() => null);
    if (kbps !== null && kbps < MIN_KBPS) {
      reportSlowNetwork();
      return "slow";
    }
    return "ok";
  })();
  return checked;
}

/** Call stats that mean "the connection can barely carry the call". */
export function slowCallStats(st: { rttMs: number | null; capKbps?: number; lossOut: number | null } | null | undefined): boolean | null {
  if (!st) return null;
  return (st.rttMs !== null && st.rttMs > 450) || (typeof st.capKbps === "number" && st.capKbps > 0 && st.capKbps < 250) || (st.lossOut !== null && st.lossOut > 0.08);
}

/**
 * Reports a slow network when `slow` stays true for `holdMs`. `sample` changes with every
 * new stats sample (call stats arrive every ~1–2 s), so the hold is re-checked each time.
 */
export function useSlowNetReporter(slow: boolean | null, sample: unknown, holdMs = 10_000) {
  const since = useRef<number | null>(null);
  useEffect(() => {
    if (!slow) {
      since.current = null;
      return;
    }
    const now = performance.now();
    since.current ??= now;
    if (now - since.current >= holdMs) reportSlowNetwork();
  }, [slow, sample, holdMs]);
}
