"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import {
  CalendarClock,
  CalendarDays,
  LayoutGrid,
  LogOut,
  ShieldCheck,
  Smile,
  UserRound,
  Users,
  Video,
  BadgeCheck,
  type LucideIcon,
} from "lucide-react";
import { Button, Spinner } from "@/ui";
import { homeFor, useAuth } from "@/lib/auth/store";
import type { Role } from "@/lib/api/types";
import { AvatarThumb } from "@/components/avatar/AvatarThumb";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { LogoMark } from "@/components/shell/Logo";
import s from "./AppShell.module.css";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** shown on mobile tab bar (max 5) */
  tab?: boolean;
  group?: string;
  count?: number;
}

export const NAV: Record<Role, { items: NavItem[]; cta: { label: string; href: string } }> = {
  client: {
    items: [
      { href: "/app", label: "Главная", icon: LayoutGrid, tab: true },
      { href: "/app/specialists", label: "Специалисты", icon: Users, tab: true },
      { href: "/app/sessions", label: "Мои сессии", icon: Video, tab: true },
      { href: "/app/avatar", label: "Мой аватар", icon: Smile, tab: true, group: "Анонимность" },
      { href: "/app/privacy", label: "Приватность", icon: ShieldCheck, tab: true, group: "Анонимность" },
    ],
    cta: { label: "Записаться на сессию", href: "/app/specialists" },
  },
  psychologist: {
    items: [
      { href: "/pro", label: "Сводка", icon: LayoutGrid, tab: true },
      { href: "/pro/sessions", label: "Сессии", icon: Video, tab: true },
      { href: "/pro/schedule", label: "Расписание", icon: CalendarClock, tab: true },
      { href: "/pro/profile", label: "Профиль", icon: UserRound, tab: true, group: "Кабинет" },
      { href: "/pro/avatar", label: "Мой аватар", icon: Smile, tab: true, group: "Кабинет" },
    ],
    cta: { label: "Открыть расписание", href: "/pro/schedule" },
  },
  admin: {
    items: [
      { href: "/admin", label: "Сводка", icon: LayoutGrid, tab: true },
      { href: "/admin/psychologists", label: "Проверка специалистов", icon: BadgeCheck, tab: true },
      { href: "/admin/sessions", label: "Сессии", icon: CalendarDays, tab: true },
    ],
    cta: { label: "Проверить заявки", href: "/admin/psychologists" },
  },
};

const ROLE_LABEL: Record<Role, string> = {
  client: "Анонимный клиент",
  psychologist: "Специалист",
  admin: "Администратор",
};

function isActive(pathname: string, href: string, root: string) {
  return href === root ? pathname === root : pathname === href || pathname.startsWith(href + "/");
}

/**
 * Cabinet layout: sidebar (profile + nav + CTA), main column, mobile top bar
 * and bottom tab bar. Also guards the route by role.
 */
export function AppShell({ role, children }: { role: Role; children: ReactNode }) {
  const { user, status, bootstrap, logout } = useAuth();
  const pathname = usePathname() ?? "";
  const router = useRouter();

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (status === "guest") router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    else if (status === "authed" && user && user.role !== role) router.replace(homeFor(user.role));
  }, [status, user, role, router, pathname]);

  if (status !== "authed" || !user || user.role !== role) {
    return (
      <div className={s.guard}>
        <Spinner />
      </div>
    );
  }

  const nav = NAV[role];
  const root = nav.items[0].href;
  const name = user.psychologist?.display_name || user.alias;
  let lastGroup: string | undefined;

  const onLogout = () => {
    logout();
    router.replace("/");
  };

  return (
    <div className={s.root}>
      <aside className={s.sidebar} aria-label="Навигация кабинета">
        <Link href="/" className={s.brand}>
          <LogoMark className={s.brandMark} />
          aprosop
        </Link>

        <Link href={role === "admin" ? root : `${root}/avatar`} className={s.profile}>
          <span className={s.profileAvatar}>
            <AvatarThumb config={user.avatar_config} seed={user.id} size={48} />
          </span>
          <span className={s.profileText}>
            <span className={s.profileName} style={{ display: "block" }}>
              {name}
            </span>
            <span className={s.profileRole}>{ROLE_LABEL[role]}</span>
          </span>
        </Link>

        <nav className={s.nav}>
          {nav.items.map((item) => {
            const showGroup = item.group && item.group !== lastGroup;
            lastGroup = item.group;
            const Icon = item.icon;
            return (
              <div key={item.href}>
                {showGroup && <div className={s.navGroup}>{item.group}</div>}
                <Link href={item.href} className={s.navItem} aria-current={isActive(pathname, item.href, root) ? "page" : undefined}>
                  <Icon size={20} strokeWidth={1.8} />
                  {item.label}
                  {item.count ? <span className={s.navCount}>{item.count}</span> : null}
                </Link>
              </div>
            );
          })}
          <div style={{ flex: 1 }} />
          <button type="button" className={s.navItem} onClick={onLogout} style={{ border: 0, background: "none", width: "100%" }}>
            <LogOut size={20} strokeWidth={1.8} />
            Выйти
          </button>
        </nav>

        <Button variant="secondary" size="lg" block href={nav.cta.href} className={s.cta}>
          {nav.cta.label}
        </Button>
      </aside>

      <div className={s.topActions}>
        <ThemeToggle />
      </div>

      <header className={s.mobileTop}>
        <Link href={root} className={s.brand}>
          <LogoMark className={s.brandMark} />
          aprosop
        </Link>
        <div style={{ display: "flex", gap: 4 }}>
          <ThemeToggle />
          <Button variant="ghost" size="md" iconOnly aria-label="Выйти" onClick={onLogout} icon={<LogOut size={20} />} />
        </div>
      </header>

      <main className={s.main}>{children}</main>

      <nav className={s.tabbar} aria-label="Разделы">
        {nav.items
          .filter((i) => i.tab)
          .slice(0, 5)
          .map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} className={s.tab} aria-current={isActive(pathname, item.href, root) ? "page" : undefined}>
                <Icon size={22} strokeWidth={1.8} />
                {item.label.split(" ").slice(-1)[0]}
              </Link>
            );
          })}
      </nav>
    </div>
  );
}

/** Page title row: title, optional subtitle and action on the right. */
export function PageHeader({ title, sub, action }: { title: ReactNode; sub?: ReactNode; action?: ReactNode }) {
  return (
    <div className={s.pageHead}>
      <div>
        <h1 className={s.pageTitle}>{title}</h1>
        {sub && <p className={s.pageSub}>{sub}</p>}
      </div>
      {action}
    </div>
  );
}

/** Main content + sticky right rail (collapses under content on narrow screens). */
export function WithRail({ children, rail }: { children: ReactNode; rail: ReactNode }) {
  return (
    <div className={s.withRail}>
      <div className={s.stack}>{children}</div>
      <aside className={s.rail}>{rail}</aside>
    </div>
  );
}

export function Stack({ children, gap }: { children: ReactNode; gap?: number }) {
  return (
    <div className={s.stack} style={gap ? { gap } : undefined}>
      {children}
    </div>
  );
}
