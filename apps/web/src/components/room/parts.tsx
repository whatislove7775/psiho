"use client";

/** Small building blocks of the call screen. */
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { CallQuality } from "@/hooks/useP2PCall";
import s from "./Room.module.css";

/** Mounts an existing canvas element (the live avatar) into a React tree. */
export function CanvasSlot({ canvas }: { canvas: HTMLCanvasElement | null }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = ref.current;
    if (!host || !canvas) return;
    host.appendChild(canvas);
    return () => {
      if (canvas.parentNode === host) host.removeChild(canvas);
    };
  }, [canvas]);
  return <div ref={ref} className={s.fill} />;
}

/** Specialist's own camera self-view (mirrored). Never used for clients. */
export function SelfVideo({ stream, className }: { stream: MediaStream | null; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.srcObject = stream;
    if (stream) v.play().catch(() => undefined);
  }, [stream]);
  return <video ref={ref} className={`${s.selfVideo} ${className ?? ""}`} muted playsInline autoPlay aria-label="Ваша камера" />;
}

/** Live microphone level, 5 bars. Reads only the level, never records. */
export function MicMeter({ stream, muted }: { stream: MediaStream | null; muted?: boolean }) {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    if (!stream || !stream.getAudioTracks().length) return;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const src = ctx.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
    const an = ctx.createAnalyser();
    an.fftSize = 512;
    src.connect(an);
    const buf = new Float32Array(an.fftSize);
    let raf = 0;
    let smooth = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      an.getFloatTimeDomainData(buf);
      let e = 0;
      for (let i = 0; i < buf.length; i++) e += buf[i] * buf[i];
      const db = 10 * Math.log10(e / buf.length + 1e-10);
      const v = Math.max(0, Math.min(1, (db + 60) / 45));
      smooth = v > smooth ? v : smooth * 0.9 + v * 0.1;
      setLevel((l) => (Math.abs(l - smooth) > 0.03 ? smooth : l));
    };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      ctx.close().catch(() => undefined);
    };
  }, [stream]);
  const bars = 5;
  return (
    <span className={s.meter} aria-hidden>
      {Array.from({ length: bars }, (_, i) => (
        <span key={i} className={s.meterBar} data-on={!muted && level * bars > i + 0.2 ? "1" : "0"} />
      ))}
    </span>
  );
}

const QUALITY_LABEL: Record<CallQuality, string> = {
  good: "Связь хорошая",
  fair: "Связь средняя",
  poor: "Связь слабая",
  unknown: "Проверяем связь",
};

/** Three signal bars coloured by the measured connection quality. */
export function QualityBars({ quality }: { quality: CallQuality }) {
  const n = quality === "good" ? 3 : quality === "fair" ? 2 : quality === "poor" ? 1 : 0;
  return (
    <span className={s.quality} data-q={quality} role="img" aria-label={QUALITY_LABEL[quality]} title={QUALITY_LABEL[quality]}>
      {[0, 1, 2].map((i) => (
        <span key={i} style={{ height: 5 + i * 4 }} data-on={i < n ? "1" : "0"} />
      ))}
    </span>
  );
}
export { QUALITY_LABEL };

type Corner = "tl" | "tr" | "bl" | "br";

/**
 * Self-view picture-in-picture: drag it anywhere, it snaps to the nearest
 * corner (like FaceTime). Keyboard: arrow keys move it between corners.
 */
export function DraggablePip({ children, label, wide }: { children: ReactNode; label: string; wide?: boolean }) {
  const [corner, setCorner] = useState<Corner>(() => {
    try {
      return (localStorage.getItem("aprosop.pipCorner") as Corner) || "br";
    } catch {
      return "br";
    }
  });
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const start = useRef<{ px: number; py: number; x: number; y: number; moved: boolean } | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem("aprosop.pipCorner", corner);
    } catch {
      /* ignore */
    }
  }, [corner]);

  const onDown = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const parent = el.offsetParent?.getBoundingClientRect() ?? { left: 0, top: 0 };
    start.current = { px: e.clientX, py: e.clientY, x: r.left - parent.left, y: r.top - parent.top, moved: false };
    el.setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const st = start.current;
    if (!st) return;
    const dx = e.clientX - st.px, dy = e.clientY - st.py;
    if (!st.moved && Math.hypot(dx, dy) < 4) return;
    st.moved = true;
    setDrag({ x: st.x + dx, y: st.y + dy });
  };
  const onUp = () => {
    const st = start.current;
    start.current = null;
    const el = ref.current;
    if (!st?.moved || !el || !drag) {
      setDrag(null);
      return;
    }
    const host = (el.offsetParent as HTMLElement | null)?.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (host) {
      const cx = r.left + r.width / 2 - host.left, cy = r.top + r.height / 2 - host.top;
      setCorner(`${cy < host.height / 2 ? "t" : "b"}${cx < host.width / 2 ? "l" : "r"}` as Corner);
    }
    setDrag(null);
  };
  const onKey = (e: React.KeyboardEvent) => {
    const map: Record<string, (c: Corner) => Corner> = {
      ArrowLeft: (c) => `${c[0]}l` as Corner,
      ArrowRight: (c) => `${c[0]}r` as Corner,
      ArrowUp: (c) => `t${c[1]}` as Corner,
      ArrowDown: (c) => `b${c[1]}` as Corner,
    };
    if (map[e.key]) {
      e.preventDefault();
      setCorner(map[e.key]);
    }
  };
  return (
    <div
      ref={ref}
      className={`${s.pip} ${wide ? s.pipWide : ""} ${drag ? s.pipDragging : ""}`}
      data-corner={corner}
      style={drag ? { left: drag.x, top: drag.y, right: "auto", bottom: "auto" } : undefined}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onKeyDown={onKey}
      tabIndex={0}
      role="group"
      aria-label={`${label}. Стрелками можно передвинуть в другой угол`}
    >
      {children}
    </div>
  );
}

export function mmss(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const ss = String(sec % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${String(m).padStart(2, "0")}:${ss}`;
}

/** "ещё 38 мин" / "время вышло" from the booked end. */
export function useRemaining(start: string | null, minutes: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(t);
  }, []);
  if (!start || !minutes) return null;
  const left = Math.ceil((new Date(start).getTime() + minutes * 60000 - now) / 60000);
  return {
    left,
    text:
      left > 60
        ? `ещё ${Math.floor(left / 60)} ч ${left % 60} мин`
        : left > 0
          ? `ещё ${left} мин`
          : left === 0
            ? "время вышло"
            : `сверх времени ${-left} мин`,
  };
}
