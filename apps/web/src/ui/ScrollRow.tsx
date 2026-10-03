"use client";

/**
 * Horizontal scroller that makes it obvious the content continues:
 * - soft edge fades on the side(s) that have more content;
 * - desktop (fine pointer): small round arrow buttons on hover;
 * - touch: a thin progress track under the row.
 * Indicators appear only when the row actually overflows.
 */
import { t } from "@/lib/i18n";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import s from "./ui.module.css";

export function ScrollRow({
  children,
  className,
  trackClassName,
  label,
  role = "list",
  style,
}: {
  children: ReactNode;
  /** extra class for the outer wrapper */
  className?: string;
  /** extra class for the scrolling track (gap, padding, item sizes) */
  trackClassName?: string;
  label?: string;
  role?: string;
  style?: CSSProperties;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [st, setSt] = useState({ over: false, start: true, end: true, frac: 1, pos: 0 });

  const measure = useCallback(() => {
    const el = track.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const over = max > 2;
    setSt({
      over,
      start: el.scrollLeft <= 2,
      end: el.scrollLeft >= max - 2,
      frac: over ? el.clientWidth / el.scrollWidth : 1,
      pos: over ? el.scrollLeft / max : 0,
    });
  }, []);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    Array.from(el.children).forEach((c) => ro.observe(c));
    const mo = new MutationObserver(() => {
      Array.from(el.children).forEach((c) => ro.observe(c));
      measure();
    });
    mo.observe(el, { childList: true });
    el.addEventListener("scroll", measure, { passive: true });
    return () => {
      ro.disconnect();
      mo.disconnect();
      el.removeEventListener("scroll", measure);
    };
  }, [measure]);

  const page = (dir: 1 | -1) => {
    const el = track.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(160, el.clientWidth * 0.8), behavior: "smooth" });
  };

  return (
    <div
      className={[s.scrollRow, className].filter(Boolean).join(" ")}
      data-over={st.over ? "" : undefined}
      data-start={st.start ? "" : undefined}
      data-end={st.end ? "" : undefined}
      style={style}
    >
      <div ref={track} className={[s.srTrack, trackClassName].filter(Boolean).join(" ")} role={role} aria-label={label}>
        {children}
      </div>
      {st.over && (
        <>
          <button type="button" className={`${s.srArrow} ${s.srPrev}`} onClick={() => page(-1)} disabled={st.start} aria-label={t("Назад")} tabIndex={-1}>
            <ChevronLeft size={18} strokeWidth={2.2} />
          </button>
          <button type="button" className={`${s.srArrow} ${s.srNext}`} onClick={() => page(1)} disabled={st.end} aria-label={t("Дальше")} tabIndex={-1}>
            <ChevronRight size={18} strokeWidth={2.2} />
          </button>
          <span className={s.srBar} aria-hidden>
            <span style={{ width: `${st.frac * 100}%`, transform: `translateX(${(st.pos * (1 - st.frac) * 100) / st.frac}%)` }} />
          </span>
        </>
      )}
    </div>
  );
}
