"use client";

/**
 * Hidden developer overlay for the call screen: open the room with ?debug=1.
 * Shows only numbers: avatar pipeline (detector backend, tracking fps, model
 * time, camera→avatar latency, render/send fps) and WebRTC stats.
 */
import { t as tt } from "@/lib/i18n";
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
      [tt("детектор"), snap.backend],
      [tt("камера / трекинг"), `${snap.camFps} / ${snap.detectFps} fps`],
      [tt("модель"), `${snap.detectMs} ms (p95 ${snap.detectP95})`],
      [tt("кадр → аватар"), `${snap.latencyMs} ms (p95 ${snap.latencyP95})`],
      [tt("рендер"), `${snap.renderFps} fps, ${snap.renderMs} ms`],
      [tt("в\u00a0звонок"), `${snap.sendFps} fps`],
      [tt("пропущено кадров"), String(snap.dropped)],
    );
    if (decision) rows.push([tt("выбор"), decision.replace(/^\S+ /, "")]);
  }
  rows.push(
    [tt("соединение"), `${status}${stats?.relay ? " (TURN)" : ""}`],
    ["RTT", stats?.rttMs != null ? `${stats.rttMs} ms` : "—"],
    [tt("потери вх\u00a0/ исх"), `${pct(stats?.lossIn)} / ${pct(stats?.lossOut)}`],
    [tt("битрейт вх\u00a0/ исх"), stats ? tt(`{recvKbps} / {sendKbps} кбит/с`, { recvKbps: stats.recvKbps, sendKbps: stats.sendKbps }) : "—"],
    [tt("лимит видео"), stats ? tt(`{capKbps} кбит/с`, { capKbps: stats.capKbps }) : "—"],
    [tt("кодек"), stats?.codec ?? "—"],
    [tt("приём"), stats ? `${stats.recvSize ?? "—"} ${stats.recvFps ?? "—"} fps` : "—"],
    [tt("отправка"), stats ? `${stats.sendFps ?? "—"} fps${stats.limitation && stats.limitation !== "none" ? tt(`, ограничено: {limitation}`, { limitation: stats.limitation }) : ""}` : "—"],
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
