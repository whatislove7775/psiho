"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { attachmentUrl } from "@/lib/api/chat";
import s from "./chat.module.css";

export function fmtDuration(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * Voice message: play button + waveform (peaks from the sender) + time.
 * `messageId` → the decrypted file is fetched on first play; `src` → local preview.
 */
export function VoicePlayer({
  messageId,
  src,
  peaks,
  durationMs,
  tone = "theirs",
}: {
  messageId?: string;
  src?: string;
  peaks: number[];
  durationMs: number;
  tone?: "mine" | "theirs" | "plain";
}) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [failed, setFailed] = useState(false);
  const bars = peaks.length ? peaks : new Array(40).fill(0.25);

  useEffect(
    () => () => {
      audio.current?.pause();
    },
    [],
  );

  const ensure = async () => {
    if (audio.current) return audio.current;
    const url = src ?? (messageId ? await attachmentUrl(messageId) : null);
    if (!url) throw new Error("no source");
    const a = new Audio(url);
    a.preload = "auto";
    a.ontimeupdate = () => {
      const d = a.duration && isFinite(a.duration) ? a.duration * 1000 : durationMs;
      setProgress(d ? Math.min(1, (a.currentTime * 1000) / d) : 0);
    };
    a.onended = () => {
      setPlaying(false);
      setProgress(0);
    };
    a.onpause = () => setPlaying(false);
    a.onplay = () => setPlaying(true);
    audio.current = a;
    return a;
  };

  const toggle = async () => {
    try {
      setLoading(true);
      const a = await ensure();
      if (a.paused) await a.play();
      else a.pause();
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = audio.current;
    if (!a) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const d = a.duration && isFinite(a.duration) ? a.duration : durationMs / 1000;
    a.currentTime = ratio * d;
  };

  const shown = playing || progress > 0 ? progress * durationMs : durationMs;

  return (
    <div className={`${s.voice} ${s[`voice_${tone}`]}`}>
      <button
        type="button"
        className={s.voicePlay}
        onClick={toggle}
        aria-label={playing ? "Пауза" : "Слушать голосовое"}
        disabled={loading && !audio.current}
      >
        {loading && !audio.current ? <span className={s.miniSpin} /> : playing ? <Pause size={18} /> : <Play size={18} />}
      </button>
      <div className={s.wave} onClick={seek} role="presentation">
        {bars.map((p, i) => (
          <span
            key={i}
            className={s.bar}
            data-on={i / bars.length < progress ? "" : undefined}
            style={{ height: `${Math.round(12 + p * 88)}%` }}
          />
        ))}
      </div>
      <span className={s.voiceTime}>{failed ? "Ошибка" : fmtDuration(shown)}</span>
    </div>
  );
}
