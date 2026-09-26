"use client";

import { useEffect } from "react";
import { Check } from "lucide-react";
import { BACKDROP_GROUPS, PHOTO_BACKDROPS, preloadBackdrop, type BackdropId } from "@/lib/avatar/backdrops";
import s from "./BackdropPicker.module.css";

/**
 * Round swatches to choose the background behind the live avatar, in two
 * groups: «Градиенты» and «Пейзажи» (landscape photos, credited below).
 */
export function BackdropPicker({
  value,
  onChange,
  size = "md",
}: {
  value: BackdropId;
  onChange: (id: BackdropId) => void;
  size?: "sm" | "md";
}) {
  // the chosen photo is usually needed right away; others load on hover/focus
  useEffect(() => preloadBackdrop(value), [value]);
  return (
    <div className={s.picker} data-size={size}>
      {BACKDROP_GROUPS.map((group) => (
        <div key={group.label} className={s.group}>
          <div className={s.groupLabel} id={`bd-${group.label}`}>
            {group.label}
          </div>
          <div className={s.row} role="radiogroup" aria-labelledby={`bd-${group.label}`}>
            {group.items.map((b) => {
              const on = b.id === value;
              const title = b.credit ? `${b.label} · фото: ${b.credit}` : b.label;
              return (
                <button
                  key={b.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={b.label}
                  title={title}
                  className={s.swatch}
                  style={{ background: b.css }}
                  onPointerEnter={() => preloadBackdrop(b.id)}
                  onFocus={() => preloadBackdrop(b.id)}
                  onClick={() => onChange(b.id)}
                >
                  {on && <Check size={size === "sm" ? 14 : 18} strokeWidth={2.6} aria-hidden />}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {PHOTO_BACKDROPS.length > 0 && (
        <a className={s.credit} href="/backdrops/CREDITS.txt" target="_blank" rel="noopener">
          Фото пейзажей: Unsplash и Pexels, авторы
        </a>
      )}
    </div>
  );
}
