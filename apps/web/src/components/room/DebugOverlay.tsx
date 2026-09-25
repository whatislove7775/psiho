"use client";

/**
 * Hidden developer overlay for the call screen: open the room with ?debug=1.
 * Shows only numbers: avatar pipeline (detector backend, tracking fps, model
 * time, camera→avatar latency, render/send fps) and WebRTC stats.
 */
import { useEffect, useState } from "react";
import { avatarPerf, type AvatarPerfSnapshot } from "@/lib/tracking/perf";
import type { CallStats, P2PStatus } from "@/hooks/useP2PCall";
import s from "./Room.module.css";

export function DebugOverlay({ stats, status, avatar }: { stats: CallStats | null; status: P2PStatus; avatar: boolean }) {
  const [snap, setSnap] = useState<AvatarPerfSnapshot | null>(null);
  const [decision, setDecision] = useState<string>("");
  useEffect(() => {
    const t = setInterval(() => {
      setSnap(avatarPerf.snapshot());
      setDecision(avatarPerf.decision[avatarPerf.decision.length - 1] ?? "");
    }, 500);
    return () => clearInterval(t);
  }, []);
  const pct = (x: number | null | undefined) => (x == null ? "—" : `${(x * 100).toFixed(1)}%`);
  const rows: [string, string][] = [];
  if (avatar && snap) {
    rows.push(
      ["детектор", snap.backend],
      ["камера / трекинг", `${snap.camFps} / ${snap.detectFps} fps`],
      ["модель", `${snap.detectMs} ms (p95 ${snap.detectP95})`],
      ["кадр → аватар", `${snap.latencyMs} ms (p95 ${snap.latencyP95})`],
      ["рендер", `${snap.renderFps} fps, ${snap.renderMs} ms`],
      ["в звонок", `${snap.sendFps} fps`],
      ["пропущено кадров", String(snap.dropped)],
    );
    if (decision) rows.push(["выбор", decision.replace(/^\S+ /, "")]);
  }
  rows.push(
    ["соединение", `${status}${stats?.relay ? " (TURN)" : ""}`],
    ["RTT", stats?.rttMs != null ? `${stats.rttMs} ms` : "—"],
    ["потери вх / исх", `${pct(stats?.lossIn)} / ${pct(stats?.lossOut)}`],
    ["битрейт вх / исх", stats ? `${stats.recvKbps} / ${stats.sendKbps} кбит/с` : "—"],
    ["лимит видео", stats ? `${stats.capKbps} кбит/с` : "—"],
    ["кодек", stats?.codec ?? "—"],
    ["приём", stats ? `${stats.recvSize ?? "—"} ${stats.recvFps ?? "—"} fps` : "—"],
    ["отправка", stats ? `${stats.sendFps ?? "—"} fps${stats.limitation && stats.limitation !== "none" ? `, ограничено: ${stats.limitation}` : ""}` : "—"],
  );
  return (
    <div className={s.debug} aria-hidden>
      {rows.map(([k, v]) => (
        <div key={k}>
          <span>{k}</span>
          <b>{v}</b>
        </div>
      ))}
    </div>
  );
}
