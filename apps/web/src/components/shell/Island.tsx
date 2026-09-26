"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { BookOpen, CalendarClock, LayoutGrid, MessagesSquare, Search, type LucideIcon } from "lucide-react";
import { PanicButton } from "@/components/privacy/PanicButton";
import s from "./Island.module.css";

export interface IslandItem {
  href: string;
  label: string;
  icon?: LucideIcon;
  /** custom icon (profile avatar) */
  art?: ReactNode;
  badge?: number;
  active: boolean;
}

/** Items of the mobile island per cabinet (4–5 key places). */
export function islandItems(
  role: "client" | "psychologist" | "admin",
  isActive: (href: string, also?: string[]) => boolean,
  unread: number,
  avatar: ReactNode,
): IslandItem[] {
  if (role === "client") {
    return [
      { href: "/app", label: "Главная", icon: LayoutGrid, active: isActive("/app") },
      { href: "/app/dialogs", label: "Диалоги", icon: MessagesSquare, badge: unread, active: isActive("/app/dialogs") },
      { href: "/app/specialists", label: "Поиск", icon: Search, active: isActive("/app/specialists") },
      { href: "/app/articles", label: "Полезное", icon: BookOpen, active: isActive("/app/articles", ["/app/practices"]) },
      {
        href: "/app/profile",
        label: "Профиль",
        art: avatar,
        active: isActive("/app/profile", ["/app/avatar", "/app/balance"]),
      },
    ];
  }
  if (role === "psychologist") {
    return [
      { href: "/pro", label: "Сводка", icon: LayoutGrid, active: isActive("/pro") },
      { href: "/pro/dialogs", label: "Диалоги", icon: MessagesSquare, badge: unread, active: isActive("/pro/dialogs") },
      { href: "/pro/schedule", label: "Расписание", icon: CalendarClock, active: isActive("/pro/schedule") },
      {
        href: "/pro/profile",
        label: "Профиль",
        art: avatar,
        active: isActive("/pro/profile", ["/pro/earnings", "/pro/check", "/pro/avatar"]),
      },
    ];
  }
  return [];
}

/**
 * Mobile bottom navigation as a floating glass «island»: hides while scrolling
 * down, comes back on scroll up; the active pill slides between items.
 * Hidden on desktop (CSS) and under an open dialogue thread (html[data-thread]).
 * The quick-exit button of the stealth mode docks next to it.
 */
export function Island({ items }: { items: IslandItem[] }) {
  const [hidden, setHidden] = useState(false);
  const last = useRef(0);
  const active = items.findIndex((i) => i.active);

  useEffect(() => {
    last.current = window.scrollY;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const y = window.scrollY;
        const dy = y - last.current;
        const nearBottom = window.innerHeight + y >= document.documentElement.scrollHeight - 24;
        if (y < 80 || nearBottom) setHidden(false);
        else if (dy > 6) setHidden(true);
        else if (dy < -6) setHidden(false);
        if (Math.abs(dy) > 6) last.current = y;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  if (!items.length) return null;

  return (
    <>
      <nav
        className={s.island}
        aria-label="Разделы"
        data-hidden={hidden ? "" : undefined}
        style={{ ["--n" as string]: items.length, ["--i" as string]: Math.max(active, 0) }}
        onFocus={() => setHidden(false)}
      >
        {active >= 0 && <span className={s.pill} aria-hidden />}
        {items.map((it) => {
          const Icon = it.icon;
          return (
            <Link key={it.href} href={it.href} className={s.item} aria-current={it.active ? "page" : undefined}>
              <span className={s.icon}>
                {it.art ? <span className={s.art}>{it.art}</span> : Icon ? <Icon size={22} strokeWidth={1.9} /> : null}
                {it.badge ? (
                  <span className={s.badge} aria-label={`${it.badge} непрочитанных`}>
                    {it.badge > 9 ? "9+" : it.badge}
                  </span>
                ) : null}
              </span>
              <span className={s.label}>{it.label}</span>
            </Link>
          );
        })}
      </nav>
      <PanicButton docked />
    </>
  );
}
