"use client";

import { t } from "@/lib/i18n";
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { ZoomIn, ZoomOut } from "lucide-react";
import s from "./media.module.css";

const MAX_ZOOM = 3;

export interface CropImage {
  url: string;
  w: number;
  h: number;
}

/** Normalised crop: x/y — top-left as a fraction of the source width/height, w/h — frame size as fractions. */
export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Drag-to-move, slider/wheel-to-zoom crop editor with a fixed frame of `aspect` (width / height).
 * `mask="circle"` darkens everything outside a round guide (profile photos).
 */
export function Cropper({
  img,
  aspect,
  mask = "rect",
  maxWidth = 480,
  onCrop,
}: {
  img: CropImage;
  aspect: number;
  mask?: "rect" | "circle";
  maxWidth?: number;
  onCrop: (c: CropRect) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [VW, setVW] = useState(Math.min(maxWidth, 280));
  const VH = VW / aspect;
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setVW(Math.max(200, Math.min(maxWidth, el.clientWidth)));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [maxWidth]);

  // Cover the frame at zoom 1
  const scale = Math.max(VW / img.w, VH / img.h) * zoom;
  const W = img.w * scale;
  const H = img.h * scale;
  const clamp = (p: { x: number; y: number }) => ({
    x: Math.min(0, Math.max(VW - W, p.x)),
    y: Math.min(0, Math.max(VH - H, p.y)),
  });

  const prev = useRef<{ scale: number; VW: number } | null>(null);
  useEffect(() => {
    setPos((p) => {
      const was = prev.current;
      if (!was || was.VW !== VW) return clamp({ x: (VW - W) / 2, y: (VH - H) / 2 });
      const k = scale / was.scale;
      return clamp({ x: VW / 2 - (VW / 2 - p.x) * k, y: VH / 2 - (VH / 2 - p.y) * k });
    });
    prev.current = { scale, VW };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale, VW]);

  useEffect(() => {
    onCrop({
      x: Math.max(0, -pos.x / scale / img.w),
      y: Math.max(0, -pos.y / scale / img.h),
      w: Math.min(1, VW / scale / img.w),
      h: Math.min(1, VH / scale / img.h),
    });
  }, [pos, scale, img, VW, VH, onCrop]);

  const down = (e: RPointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, x: pos.x, y: pos.y };
  };
  const move = (e: RPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    setPos(clamp({ x: d.x + e.clientX - d.px, y: d.y + e.clientY - d.py }));
  };
  const up = () => (drag.current = null);

  return (
    <div className={s.cropper} ref={box}>
      <div
        className={s.view}
        data-mask={mask}
        style={{ width: VW, height: VH }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onWheel={(e) => setZoom((z) => Math.min(MAX_ZOOM, Math.max(1, z - e.deltaY * 0.0015)))}
        aria-label={t("Передвиньте картинку, чтобы выбрать кадр")}
        role="img"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={img.url} alt="" draggable={false} style={{ width: W, height: H, transform: `translate(${pos.x}px, ${pos.y}px)` }} />
        <span className={s.frame} aria-hidden />
      </div>
      <div className={s.zoom} style={{ maxWidth: Math.min(VW, 320) }}>
        <ZoomOut size={16} aria-hidden />
        <input type="range" min={1} max={MAX_ZOOM} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} aria-label={t("Масштаб")} />
        <ZoomIn size={16} aria-hidden />
      </div>
    </div>
  );
}

/** Read a picked file into {url, w, h}; rejects wrong type/size/too small with a Russian message. */
export function readImage(
  file: File,
  { types, maxBytes, minW, minH }: { types: string[]; maxBytes: number; minW: number; minH: number },
): Promise<CropImage> {
  return new Promise((resolve, reject) => {
    if (!types.includes(file.type)) return reject(new Error(t("Подойдёт JPG, PNG или\u00a0WebP.")));
    if (file.size > maxBytes) return reject(new Error(t(`Файл больше {v} МБ. Выберите поменьше.`, { v: Math.round(maxBytes / 1024 / 1024) })));
    const url = URL.createObjectURL(file);
    const probe = new Image();
    probe.onload = () => {
      if (probe.naturalWidth < minW || probe.naturalHeight < minH) {
        URL.revokeObjectURL(url);
        reject(new Error(t(`Картинка слишком маленькая: нужно хотя\u00a0бы {minW}×{minH}.`, { minW, minH })));
        return;
      }
      resolve({ url, w: probe.naturalWidth, h: probe.naturalHeight });
    };
    probe.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(t("Не\u00a0получилось открыть файл. Попробуйте другой.")));
    };
    probe.src = url;
  });
}
