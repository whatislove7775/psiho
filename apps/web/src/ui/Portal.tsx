"use client";

/**
 * Renders children into <body>. Every overlay (modal, sheet, lightbox, popover, toast) goes through it:
 * a position:fixed element inside a transformed / filtered / contained ancestor (animated cards, sheets,
 * blurred bars) is positioned relative to that ancestor instead of the viewport — off-centre and clipped.
 */
import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function Portal({ children }: { children: ReactNode }) {
  // Mount after hydration (the server has no <body> to portal into); layout effect = before paint.
  const [mounted, setMounted] = useState(false);
  useIsoLayoutEffect(() => setMounted(true), []);
  if (!mounted || typeof document === "undefined") return null;
  // In fullscreen only the fullscreen element's subtree is visible (the call screen), so render there.
  return createPortal(children, (document.fullscreenElement as HTMLElement | null) ?? document.body);
}
