"use client";

import { EyeOff } from "lucide-react";
import { usePrivacyPrefs } from "@/lib/privacy/usePrivacy";
import { panicExit } from "@/lib/privacy/stealth";
import s from "./privacy.module.css";

/**
 * Quick exit of the stealth mode for touch screens (double Esc does the same on
 * a keyboard). One tap: the page is hidden and replaced by a neutral site.
 * `docked` — next to the mobile island (moves to the top inside an open thread);
 * `inline` — a header icon button of an open thread on phones;
 * otherwise a small floating button (call room).
 */
export function PanicButton({ docked, inline }: { docked?: boolean; inline?: boolean }) {
  const [prefs, , ready] = usePrivacyPrefs();
  if (!ready || !prefs.stealth.enabled) return null;
  return (
    <button
      type="button"
      className={inline ? s.panicInline : `${s.panic} ${docked ? s.panicDocked : s.panicFloat}`}
      onClick={panicExit}
      // pointerdown: leave even before the click is confirmed
      onPointerDown={(e) => {
        if (e.pointerType !== "mouse") panicExit();
      }}
      aria-label="Быстрый выход: открыть нейтральный сайт"
      title="Быстрый выход (или дважды Esc)"
    >
      <EyeOff size={docked ? 22 : 20} strokeWidth={inline ? 1.8 : 2} />
    </button>
  );
}
