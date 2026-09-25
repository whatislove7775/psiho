"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { encodeQr, qrPath } from "@/lib/qr";
import s from "./lab.module.css";

/** Mounts an existing canvas element (e.g. the live avatar) into the tree. */
export function CanvasSlot({ canvas, className }: { canvas: HTMLCanvasElement | null; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = ref.current;
    if (!host || !canvas) return;
    host.appendChild(canvas);
    return () => {
      if (canvas.parentNode === host) host.removeChild(canvas);
    };
  }, [canvas]);
  return <div ref={ref} className={className ?? s.fill} />;
}

/** <video> bound to a MediaStream. */
export function StreamVideo({
  stream,
  muted = true,
  mirror,
  className,
  videoRef,
  label,
}: {
  stream: MediaStream | null;
  muted?: boolean;
  mirror?: boolean;
  className?: string;
  videoRef?: React.MutableRefObject<HTMLVideoElement | null>;
  label?: string;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (v.srcObject !== stream) v.srcObject = stream;
    if (stream) v.play().catch(() => undefined);
  }, [stream]);
  useEffect(() => {
    if (ref.current) ref.current.muted = muted;
  }, [muted]);
  return (
    <video
      ref={(el) => {
        ref.current = el;
        if (videoRef) videoRef.current = el;
      }}
      className={className ?? s.fillVideo}
      style={mirror ? { transform: "scaleX(-1)" } : undefined}
      playsInline
      autoPlay
      muted={muted}
      aria-label={label}
    />
  );
}

export function Switch({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className={s.switchRow} data-disabled={disabled || undefined}>
      <input type="checkbox" role="switch" className={s.switch} checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className={s.switchLabel}>{label}</span>
        {hint && <span className={s.switchHint}>{hint}</span>}
      </span>
    </label>
  );
}

/** Horizontal level meter 0…1. */
export function Meter({ value, tone = "primary" }: { value: number; tone?: "primary" | "success" | "warning" }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className={s.meter} data-tone={tone} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)}>
      <span style={{ transform: `scaleX(${v})` }} />
    </div>
  );
}

/** Compact «name — value» grid for live stats. */
export function StatGrid({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className={s.statGrid}>
      {items.map(([k, v], i) => (
        <div key={i}>
          <dt>{k}</dt>
          <dd className="num">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** QR code as inline SVG (generated on the device, the link never leaves the page). */
export function QrCode({ text, size = 168, label }: { text: string; size?: number; label?: string }) {
  const d = useMemo(() => {
    try {
      const qr = encodeQr(text, "M");
      return { path: qrPath(qr, 3), n: qr.size + 6 };
    } catch {
      return null;
    }
  }, [text]);
  if (!d) return null;
  return (
    <svg className={s.qr} width={size} height={size} viewBox={`0 0 ${d.n} ${d.n}`} role="img" aria-label={label ?? "QR-код ссылки"} shapeRendering="crispEdges">
      <rect width={d.n} height={d.n} fill="#fff" />
      <path d={d.path} fill="#111" />
    </svg>
  );
}

export function useInterval(fn: () => void, ms: number | null) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (ms === null) return;
    const t = setInterval(() => ref.current(), ms);
    return () => clearInterval(t);
  }, [ms]);
}

export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useInterval(() => setNow(Date.now()), ms);
  return now;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export const kbps = (bps: number | null | undefined) => (bps == null || !isFinite(bps) ? "—" : bps >= 1e6 ? `${(bps / 1e6).toFixed(2)} Мбит/с` : `${Math.round(bps / 1000)} кбит/с`);

/** Lab-chosen avatar for the «client» side of test calls (this browser only). */
const LAB_AVATAR_KEY = "aprosop.lab.avatar";
export function loadLabAvatar(): unknown | null {
  try {
    const raw = localStorage.getItem(LAB_AVATAR_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
export function saveLabAvatar(cfg: unknown | null) {
  try {
    if (cfg) localStorage.setItem(LAB_AVATAR_KEY, JSON.stringify(cfg));
    else localStorage.removeItem(LAB_AVATAR_KEY);
  } catch {
    /* private mode */
  }
}
