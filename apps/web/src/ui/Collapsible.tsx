"use client";

/**
 * Minor-info card that the user can fold (tier 3 in the visual hierarchy: smaller title, quieter surface).
 * The open/closed state is remembered per `storageKey` in this browser.
 */
import { useEffect, useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import s from "./Collapsible.module.css";

const cx = (...c: unknown[]) => c.filter((x) => typeof x === "string" && x).join(" ");
const KEY = (k: string) => `aprosop.fold.${k}`;

export function CollapsibleCard({
  title,
  sub,
  icon,
  badge,
  storageKey,
  defaultOpen = true,
  children,
  className,
  as: Tag = "section",
}: {
  title: ReactNode;
  /** short line shown next to the title while folded (e.g. «1 из 3») */
  sub?: ReactNode;
  icon?: ReactNode;
  badge?: ReactNode;
  storageKey?: string;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "aside";
}) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();

  useEffect(() => {
    if (!storageKey) return;
    try {
      const v = localStorage.getItem(KEY(storageKey));
      if (v === "0") setOpen(false);
      else if (v === "1") setOpen(true);
    } catch {
      /* storage unavailable: keep the default */
    }
  }, [storageKey]);

  const toggle = () => {
    setOpen((v) => {
      const next = !v;
      if (storageKey)
        try {
          localStorage.setItem(KEY(storageKey), next ? "1" : "0");
        } catch {
          /* ignore */
        }
      return next;
    });
  };

  return (
    <Tag className={cx(s.card, className)} data-open={open || undefined}>
      <button type="button" className={s.head} aria-expanded={open} aria-controls={bodyId} onClick={toggle}>
        {icon && <span className={s.icon}>{icon}</span>}
        <span className={s.title}>{title}</span>
        {sub && <span className={s.sub}>{sub}</span>}
        {badge && <span className={s.badge}>{badge}</span>}
        <ChevronDown size={18} strokeWidth={2} className={s.chevron} aria-hidden />
      </button>
      <div id={bodyId} className={s.body}>
        <div className={s.inner}>
          <div className={s.pad}>{children}</div>
        </div>
      </div>
    </Tag>
  );
}
