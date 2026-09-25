"use client";

import { Check } from "lucide-react";
import { BACKDROPS, type BackdropId } from "@/lib/avatar/backdrops";
import s from "./BackdropPicker.module.css";

/** Row of round swatches to choose the background behind the live avatar. */
export function BackdropPicker({
  value,
  onChange,
  size = "md",
}: {
  value: BackdropId;
  onChange: (id: BackdropId) => void;
  size?: "sm" | "md";
}) {
  return (
    <div className={s.row} role="radiogroup" aria-label="Фон за аватаром" data-size={size}>
      {BACKDROPS.map((b) => {
        const on = b.id === value;
        return (
          <button
            key={b.id}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={b.label}
            title={b.label}
            className={s.swatch}
            style={{ background: b.css }}
            onClick={() => onChange(b.id)}
          >
            {on && <Check size={size === "sm" ? 14 : 18} strokeWidth={2.6} aria-hidden />}
          </button>
        );
      })}
    </div>
  );
}
