"use client";

import { t as tt } from "@/lib/i18n";
import { Download, EyeOff, FileWarning, Minus, Plus, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { attachmentUrl } from "@/lib/api/chat";
import s from "./viewer.module.css";

export type ViewKind = "image" | "pdf" | "text";

/** What the in-app viewer can show; null — download only. */
export function viewKind(mime: string, name = ""): ViewKind | null {
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf") return "pdf";
  if (mime === "text/plain" || /\.txt$/i.test(name)) return "text";
  return null;
}

/** Decrypted attachment → «Save as». The file never leaves the authenticated endpoint otherwise. */
export async function saveAttachment(msgId: string, name: string) {
  const url = await attachmentUrl(msgId);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

const MIN = 1;
const MAX = 6;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Full-screen viewer: images (zoom + pan), PDF (browser viewer in an iframe, with a fallback), text. */
export function AttachmentViewer({
  msgId,
  name,
  mime,
  size,
  caption,
  viewOnceUrl,
  onClose,
}: {
  msgId: string;
  name: string;
  mime: string;
  /** bytes — shown with the type in the bottom bar */
  size?: number;
  caption?: string;
  /** «Просмотр один раз»: the already-opened file (no download, best-effort screenshot deterrence) */
  viewOnceUrl?: string;
  onClose: () => void;
}) {
  const kind = viewKind(mime, name);
  const viewOnce = !!viewOnceUrl;
  const [url, setUrl] = useState<string | null>(viewOnceUrl ?? null);
  const [veiled, setVeiled] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const stage = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; scale: number } | null>(null);
  const close = useRef<HTMLButtonElement>(null);

  // View-once: hide the picture whenever the page is not in front (app switcher, screen recorders' focus steal)
  useEffect(() => {
    if (!viewOnce) return;
    const veil = () => setVeiled(document.hidden || !document.hasFocus());
    const unveil = () => setVeiled(false);
    document.addEventListener("visibilitychange", veil);
    window.addEventListener("blur", veil);
    window.addEventListener("focus", unveil);
    return () => {
      document.removeEventListener("visibilitychange", veil);
      window.removeEventListener("blur", veil);
      window.removeEventListener("focus", unveil);
    };
  }, [viewOnce]);

  useEffect(() => {
    if (viewOnceUrl) {
      if (kind === "text")
        fetch(viewOnceUrl)
          .then((r) => r.text())
          .then(setText)
          .catch(() => setFailed(true));
      return;
    }
    let alive = true;
    attachmentUrl(msgId)
      .then(async (u) => {
        if (!alive) return;
        setUrl(u);
        if (kind === "text") {
          const buf = await (await fetch(u)).arrayBuffer();
          const bytes = new Uint8Array(buf.slice(0, 400_000));
          let t: string;
          try {
            t = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
          } catch {
            t = new TextDecoder("windows-1251").decode(bytes);
          }
          if (alive) setText(t);
        }
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [msgId, kind, viewOnceUrl]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (kind === "image" && (e.key === "+" || e.key === "=")) setScale((v) => clamp(v * 1.4, MIN, MAX));
      if (kind === "image" && e.key === "-") setScale((v) => clamp(v / 1.4, MIN, MAX));
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    close.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, kind]);

  useEffect(() => {
    if (scale === 1) setPos({ x: 0, y: 0 });
  }, [scale]);

  // Zoom around a point (cursor / pinch centre), keeping that point in place
  const zoomAt = useCallback((next: number, cx: number, cy: number) => {
    const el = stage.current;
    setScale((cur) => {
      const target = clamp(next, MIN, MAX);
      if (!el) return target;
      const r = el.getBoundingClientRect();
      const px = cx - r.left - r.width / 2;
      const py = cy - r.top - r.height / 2;
      setPos((p) => ({ x: px - ((px - p.x) * target) / cur, y: py - ((py - p.y) * target) / cur }));
      return target;
    });
  }, []);

  const onWheel = (e: React.WheelEvent) => {
    if (kind !== "image") return;
    zoomAt(scale * Math.exp(-e.deltaY * 0.0018), e.clientX, e.clientY);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale };
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      zoomAt(pinch.current.scale * (d / pinch.current.dist), (a.x + b.x) / 2, (a.y + b.y) / 2);
    } else if (scale > 1) {
      setPos((p) => ({ x: p.x + e.clientX - prev.x, y: p.y + e.clientY - prev.y }));
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };

  const pdfInline = typeof navigator === "undefined" || (navigator as Navigator & { pdfViewerEnabled?: boolean }).pdfViewerEnabled !== false;

  return createPortal(
    <div
      className={s.overlay}
      role="dialog"
      aria-modal="true"
      aria-label={name || tt("Вложение")}
      data-view-once={viewOnce || undefined}
      onContextMenu={viewOnce ? (e) => e.preventDefault() : undefined}
    >
      <div className={s.bar}>
        <span className={s.name}>
          {viewOnce && (
            <span className={s.onceTag}>
              <EyeOff size={14} aria-hidden />{" "}{tt("Один просмотр")}
            </span>
          )}
        </span>
        {kind === "image" && url && (
          <span className={s.zoom}>
            <button type="button" onClick={() => setScale((v) => clamp(v / 1.4, MIN, MAX))} disabled={scale <= MIN} aria-label={tt("Уменьшить")}>
              <Minus size={18} />
            </button>
            <button type="button" className={s.pct} onClick={() => setScale(1)} aria-label={tt("Исходный масштаб")}>
              {Math.round(scale * 100)}%
            </button>
            <button type="button" onClick={() => setScale((v) => clamp(v * 1.4, MIN, MAX))} disabled={scale >= MAX} aria-label={tt("Увеличить")}>
              <Plus size={18} />
            </button>
          </span>
        )}
        {!viewOnce && (
          <button type="button" onClick={() => saveAttachment(msgId, name).catch(() => setFailed(true))} aria-label={tt("Скачать")}>
            <Download size={18} />
          </button>
        )}
        <button type="button" ref={close} onClick={onClose} aria-label={tt("Закрыть")}>
          <X size={20} />
        </button>
      </div>

      <div
        ref={stage}
        className={`${s.stage} ${kind === "image" ? s.stageImage : ""}`}
        data-zoomed={scale > 1 || undefined}
        data-veiled={veiled || undefined}
        onClick={(e) => kind === "image" && scale === 1 && e.target === e.currentTarget && onClose()}
        onWheel={onWheel}
      >
        {failed ? (
          <div className={s.fallback}>
            <FileWarning size={28} />
            <p>{tt("Не\u00a0получилось открыть файл.")}</p>
          </div>
        ) : !url || (kind === "text" && text === null) ? (
          <span className={s.spinner} aria-label={tt("Загрузка")} />
        ) : kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={name}
            className={s.image}
            draggable={false}
            style={{ transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})` }}
            onDoubleClick={(e) => (scale > 1 ? setScale(1) : zoomAt(2.5, e.clientX, e.clientY))}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
        ) : kind === "pdf" && pdfInline ? (
          <iframe src={url} title={name} className={s.frame} />
        ) : kind === "text" ? (
          <pre className={s.text}>{text}</pre>
        ) : (
          <div className={s.fallback}>
            <FileWarning size={28} />
            <p>{tt("Этот браузер не\u00a0показывает PDF внутри страницы.")}</p>
            <div className={s.fallbackActions}>
              <a href={url} target="_blank" rel="noopener noreferrer">
                {tt("Открыть в\u00a0новой вкладке")}
              </a>
              <button type="button" onClick={() => saveAttachment(msgId, name)}>
                {tt("Скачать")}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* file details live here, not in the chat bubble (like popular messengers) */}
      {(name || caption || viewOnce) && (
        <div className={s.foot}>
          {viewOnce && <p className={s.fileInfo}>{tt("После закрытия файл исчезнет у\u00a0обоих")}</p>}
          {caption && <p className={s.caption}>{caption}</p>}
          {name && (
            <p className={s.fileInfo}>
              <span className={s.fileInfoName}>{name}</span>
              <span>{fileInfo(name, size)}</span>
            </p>
          )}
        </div>
      )}
    </div>,
    document.body,
  );
}

function fileInfo(name: string, size?: number): string {
  const ext = name.includes(".") ? name.split(".").pop()!.toUpperCase() : "";
  if (size == null) return ext;
  const sz = size < 1024 ? tt(`{size}\u00a0Б`, { size }) : size < 1024 * 1024 ? tt(`{v}\u00a0КБ`, { v: Math.round(size / 1024) }) : tt(`{v}\u00a0МБ`, { v: (size / 1024 / 1024).toFixed(1).replace(".", ",") });
  return ext ? `${ext}, ${sz}` : sz;
}
