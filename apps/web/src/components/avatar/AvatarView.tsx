"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { AvatarConfig } from "@/lib/avatar/schema";
import type { AvatarRendererApi, Framing } from "@/lib/avatar/kit/types";

export interface AvatarViewHandle {
  renderer: AvatarRendererApi | null;
}

/**
 * Live, animated 3D avatar filling its container. Idle animation (blinking,
 * breathing, glancing) is on by default; drag to turn the head.
 */
export const AvatarView = forwardRef<AvatarViewHandle, {
  config: AvatarConfig;
  framing?: Framing;
  expression?: Record<string, number>;
  interactive?: boolean;
  className?: string;
  style?: React.CSSProperties;
  onReady?: (r: AvatarRendererApi) => void;
}>(function AvatarView({ config, framing = "portrait", expression, interactive = true, className, style, onReady }, ref) {
  const hostRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<AvatarRendererApi | null>(null);
  const cfgRef = useRef(config);
  cfgRef.current = config;

  useImperativeHandle(ref, () => ({
    get renderer() {
      return rendererRef.current;
    },
  }));

  useEffect(() => {
    let disposed = false;
    let ro: ResizeObserver | null = null;
    const host = hostRef.current!;
    import("@/lib/avatar/kit/KitRenderer").then(({ KitRenderer }) => {
      if (disposed) return;
      const canvas = document.createElement("canvas");
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      canvas.style.display = "block";
      canvas.style.touchAction = "none";
      host.appendChild(canvas);
      const r = new KitRenderer(canvas, { framing, idle: true, background: null });
      r.setConfig(cfgRef.current);
      const fit = () => r.resize(host.clientWidth, host.clientHeight);
      fit();
      ro = new ResizeObserver(fit);
      ro.observe(host);
      r.start();
      rendererRef.current = r;
      onReady?.(r);
    });
    return () => {
      disposed = true;
      ro?.disconnect();
      rendererRef.current?.dispose();
      rendererRef.current?.canvas.remove();
      rendererRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    rendererRef.current?.setConfig(config);
  }, [config]);

  useEffect(() => {
    rendererRef.current?.setFraming(framing);
  }, [framing]);

  useEffect(() => {
    if (expression) rendererRef.current?.setExpression(expression);
  }, [expression]);

  // Drag to turn the head (studio / landing hero)
  useEffect(() => {
    if (!interactive) return;
    const host = hostRef.current!;
    let dragging = false;
    const onDown = (e: PointerEvent) => {
      dragging = true;
      host.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
      // Follow the pointer gently even without dragging; stronger while dragging.
      const k = dragging ? 0.9 : 0.35;
      rendererRef.current?.lookAt(nx * k, ny * k * 0.6);
    };
    const onUp = () => {
      dragging = false;
    };
    const onLeave = () => rendererRef.current?.lookAt(0, 0);
    host.addEventListener("pointerdown", onDown);
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerup", onUp);
    host.addEventListener("pointerleave", onLeave);
    return () => {
      host.removeEventListener("pointerdown", onDown);
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerup", onUp);
      host.removeEventListener("pointerleave", onLeave);
    };
  }, [interactive]);

  return <div ref={hostRef} className={className} style={{ position: "relative", width: "100%", height: "100%", ...style }} />;
});
