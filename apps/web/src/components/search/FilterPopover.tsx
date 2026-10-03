"use client";

/**
 * A filter pill that opens a styled popover (desktop) or a bottom sheet (≤ 560px).
 * Changes inside apply immediately; the footer shows the live result count and closes.
 * Portalled to <body>; keyboard events are stopped at the popover so a surrounding palette/modal
 * doesn't steal Esc/Tab.
 */
import { t as tt } from "@/lib/i18n";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, X } from "lucide-react";
import { plural } from "@/lib/format";
import s from "./filters.module.css";

export function FilterPopover({
  label,
  icon,
  badge,
  active,
  title,
  count,
  onReset,
  width = 340,
  noun = [tt("специалиста"), tt("специалистов"), tt("специалистов")],
  children,
}: {
  /** accusative forms for «Показать N …» (1, 2–4, 5+) */
  noun?: [string, string, string];
  label: ReactNode;
  icon?: ReactNode;
  /** small number on the pill (how many values are chosen) */
  badge?: number;
  active?: boolean;
  title: string;
  /** live result count for the footer button */
  count?: number | null;
  onReset?: () => void;
  width?: number;
  children: ReactNode;
}) {
  const id = useId();
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; maxH: number } | null>(null);

  const place = useCallback(() => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const w = Math.min(width, window.innerWidth - 16);
    const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
    const top = r.bottom + 8;
    setPos({ top, left, maxH: Math.max(240, window.innerHeight - top - 16) });
  }, [width]);

  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) btn.current?.focus({ preventScroll: true });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    const onMove = () => place();
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (pop.current?.contains(t) || btn.current?.contains(t)) return;
      close(false);
    };
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
      document.removeEventListener("pointerdown", onDown, true);
    };
  }, [open, place, close]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      const first = pop.current?.querySelector<HTMLElement>("[data-autofocus],input,button:not([data-close])");
      first?.focus({ preventScroll: true });
    }, 30);
    return () => clearTimeout(t);
  }, [open]);

  const onKey = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Tab") {
      const els = Array.from(pop.current?.querySelectorAll<HTMLElement>("input,button:not([disabled]),[tabindex='0']") ?? []);
      if (!els.length) return;
      const first = els[0];
      const last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  return (
    <>
      <button
        ref={btn}
        type="button"
        className={s.pill}
        data-active={active ? "" : undefined}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => (open ? close() : setOpen(true))}
      >
        {icon}
        <span className={s.pillLabel}>{label}</span>
        {!!badge && <span className={s.badge}>{badge}</span>}
        <ChevronDown size={14} strokeWidth={2.2} className={s.chev} aria-hidden />
      </button>
      {open &&
        pos &&
        createPortal(
          <>
            <div className={s.scrim} aria-hidden onPointerDown={() => close(false)} />
            <div
              ref={pop}
              id={id}
              role="dialog"
              aria-label={title}
              className={s.pop}
              style={{ top: pos.top, left: pos.left, width: Math.min(width, window.innerWidth - 16), maxHeight: pos.maxH }}
              onKeyDown={onKey}
            >
              <div className={s.popHead}>
                <strong>{title}</strong>
                <button type="button" data-close className={s.popClose} aria-label={tt("Закрыть")} onClick={() => close()}>
                  <X size={18} strokeWidth={2} />
                </button>
              </div>
              <div className={s.popBody}>{children}</div>
              <div className={s.popFoot}>
                {onReset && (
                  <button type="button" className={s.linkBtn} onClick={onReset} disabled={!active}>
                    {tt("Сбросить")}
                  </button>
                )}
                <button type="button" className={s.showBtn} onClick={() => close()}>
                  {count == null
                    ? tt("Готово")
                    : count === 0
                      ? tt("Никого не\u00a0нашли")
                      : tt(`Показать {count} {plural}`, { count, plural: plural(count, ...noun) })}
                </button>
              </div>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
