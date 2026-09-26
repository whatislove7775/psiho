"use client";

import { EyeOff } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth/store";
import s from "./privacy.module.css";

/**
 * «Защита от скриншотов» (best effort): the browser cannot truly block screen
 * capture, so this only makes accidental or casual copies harder —
 *  • the thread is blurred while the window/tab is not focused or hidden
 *    (app switcher previews, snipping overlays that steal focus, screen sharing of another window);
 *  • no text selection, copy, context menu, drag or printing inside the thread;
 *  • a faint watermark with the viewer's alias over the thread;
 *  • PrintScreen: the thread is veiled and the clipboard overwritten where the browser lets us.
 */
export function ScreenShield({ active, children }: { active: boolean; children: ReactNode }) {
  const user = useAuth((st) => st.user);
  const [veiled, setVeiled] = useState(false);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (!active) {
      setVeiled(false);
      return;
    }
    const update = () => setVeiled(document.visibilityState !== "visible" || !document.hasFocus());
    let flashTimer: ReturnType<typeof setTimeout> | undefined;
    const onKey = (e: KeyboardEvent) => {
      const shot =
        e.key === "PrintScreen" ||
        e.code === "PrintScreen" ||
        // macOS: ⌘⇧3 / ⌘⇧4 / ⌘⇧5; Windows: Win+Shift+S
        (e.metaKey && e.shiftKey && /^(Digit[345]|KeyS)$/.test(e.code));
      if (!shot) return;
      setFlash(true);
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => setFlash(false), 1500);
      if (e.key === "PrintScreen") navigator.clipboard?.writeText(" ").catch(() => undefined);
    };
    update();
    window.addEventListener("blur", update);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", onKey, true);
    return () => {
      clearTimeout(flashTimer);
      window.removeEventListener("blur", update);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keyup", onKey, true);
    };
  }, [active]);

  const mark = user ? user.psychologist?.display_name || user.alias : "";
  const watermark = useMemo(() => {
    if (!mark) return undefined;
    const text = mark.replace(/[<&>"]/g, "");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="150"><text x="0" y="90" transform="rotate(-24 120 75)" font-family="Onest, sans-serif" font-size="15" font-weight="600" fill="#888">${text}</text></svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  }, [mark]);

  if (!active) return <>{children}</>;

  const block = (e: { preventDefault: () => void }) => e.preventDefault();
  const hide = veiled || flash;
  return (
    <div
      className={s.shield}
      data-veiled={hide ? "" : undefined}
      onCopy={block}
      onCut={block}
      onContextMenu={block}
      onDragStart={block}
    >
      {children}
      {watermark && <div className={s.watermark} style={{ backgroundImage: watermark }} aria-hidden />}
      {hide && (
        <div className={s.veil} role="status">
          <EyeOff size={22} />
          <span>Переписка скрыта, пока окно не активно</span>
        </div>
      )}
    </div>
  );
}
