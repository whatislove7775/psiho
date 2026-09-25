"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  BookOpen,
  Leaf,
  Camera,
  Wallet,
  Banknote,
  CalendarClock,
  CalendarDays,
  LayoutGrid,
  LogOut,
  MessagesSquare,
  Smile,
  UserRound,
  Users,
  BadgeCheck,
  type LucideIcon,
} from "lucide-react";
import { chatApi } from "@/lib/api/chat";
import { chatSocket } from "@/lib/chat/socket";
import { MI, Morph } from "@/components/ui/Morph";
import { Button, Spinner } from "@/ui";
import { homeFor, useAuth } from "@/lib/auth/store";
import type { Role } from "@/lib/api/types";
import { AvatarThumb } from "@/components/avatar/AvatarThumb";
import { SpecialistPhoto } from "@/components/avatar/SpecialistPhoto";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { BalanceChip } from "@/components/billing/BalanceChip";
import { LogoMark } from "@/components/shell/Logo";
import s from "./AppShell.module.css";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** shown on mobile tab bar (max 5) */
  tab?: boolean;
  /** short label for the mobile tab bar */
  tabLabel?: string;
  /** other routes that make this item active (e.g. «Для себя» covers practices and articles) */
  also?: string[];
  group?: string;
  count?: number;
  /** show the unread dialogues counter */
  unread?: boolean;
}

export const NAV: Record<Role, { items: NavItem[]; cta: { label: string; href: string } }> = {
  client: {
    items: [
      { href: "/app", label: "Главная", icon: LayoutGrid, tab: true },
      { href: "/app/specialists", label: "Специалисты", icon: Users, tab: true },
      { href: "/app/dialogs", label: "Диалоги", icon: MessagesSquare, tab: true, unread: true },
      { href: "/app/practices", label: "Практики", icon: Leaf, group: "Для себя", tab: true, tabLabel: "Для себя", also: ["/app/articles"] },
      { href: "/app/articles", label: "Статьи", icon: BookOpen, group: "Для себя" },
      // Аватар, зеркало и приватность — одна страница с вкладками
      { href: "/app/avatar", label: "Аватар", icon: Smile, tab: true, group: "Анонимность" },
      { href: "/app/balance", label: "Баланс", icon: Wallet, group: "Анонимность" },
    ],
    cta: { label: "Найти специалиста", href: "/app/specialists" },
  },
  psychologist: {
    items: [
      { href: "/pro", label: "Сводка", icon: LayoutGrid, tab: true },
      { href: "/pro/dialogs", label: "Диалоги", icon: MessagesSquare, tab: true, unread: true },
      { href: "/pro/schedule", label: "Расписание", icon: CalendarClock, tab: true },
      { href: "/pro/profile", label: "Профиль", icon: UserRound, tab: true, group: "Кабинет" },
      { href: "/pro/earnings", label: "Доходы", icon: Banknote, group: "Кабинет" },
      { href: "/pro/check", label: "Проверка камеры", icon: Camera, tab: true, tabLabel: "Камера", group: "Кабинет" },
    ],
    cta: { label: "Открыть расписание", href: "/pro/schedule" },
  },
  admin: {
    items: [
      { href: "/admin", label: "Сводка", icon: LayoutGrid, tab: true },
      { href: "/admin/psychologists", label: "Проверка специалистов", icon: BadgeCheck, tab: true },
      { href: "/admin/sessions", label: "Созвоны", icon: CalendarDays, tab: true },
    ],
    cta: { label: "Проверить заявки", href: "/admin/psychologists" },
  },
};

const ROLE_LABEL: Record<Role, string> = {
  client: "Анонимный клиент",
  psychologist: "Специалист",
  admin: "Администратор",
};

/** Where the sidebar profile card leads. */
const PROFILE_HREF: Record<Role, string> = {
  client: "/app/profile",
  psychologist: "/pro/profile",
  admin: "/admin/account",
};

function isActive(pathname: string, href: string, root: string, also?: string[]) {
  const hit = (h: string) => (h === root ? pathname === root : pathname === h || pathname.startsWith(h + "/"));
  return hit(href) || (also ?? []).some(hit);
}

/** Unread messages in dialogues (sidebar and tab bar badge). */
function useUnread(enabled: boolean, pathname: string) {
  const [count, setCount] = useState(0);
  const refresh = useCallback(() => {
    if (!enabled) return;
    chatApi
      .unread()
      .then((r) => setCount(r.total))
      .catch(() => undefined);
  }, [enabled]);
  useEffect(() => {
    refresh();
  }, [refresh, pathname]);
  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(refresh, 45_000);
    let pending: ReturnType<typeof setTimeout> | null = null;
    const off = chatSocket.subscribe((e) => {
      if (e.type !== "message.new" && e.type !== "read") return;
      if (pending) clearTimeout(pending);
      pending = setTimeout(refresh, 1200);
    });
    return () => {
      clearInterval(t);
      off();
      if (pending) clearTimeout(pending);
    };
  }, [enabled, refresh]);
  return count;
}

/**
 * Cabinet layout: sidebar (profile + nav + CTA), main column, mobile top bar
 * and bottom tab bar. Also guards the route by role.
 */
export function AppShell({ role, children }: { role: Role; children: ReactNode }) {
  const { user, status, bootstrap, logout } = useAuth();
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const unread = useUnread(status === "authed" && !!user && user.role === role && role !== "admin", pathname);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  useEffect(() => setMenuOpen(false), [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [menuOpen]);

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
        {/* Theme switch lives here in every cabinet: one stable spot that never overlaps content */}
        <div className={s.brandRow}>
          <Link href="/" className={s.brand}>
            <LogoMark className={s.brandMark} />
            aprosop
          </Link>
          <ThemeToggle />
        </div>

        <Link href={PROFILE_HREF[role]} className={s.profile} title={`${name}, открыть профиль`}>
          <span className={s.profileAvatar}>
            {user.psychologist ? (
              <SpecialistPhoto url={user.psychologist.photo_url} name={name} size={48} alt="" />
            ) : (
              <AvatarThumb config={user.avatar_config} seed={user.id} size={48} />
            )}
          </span>
          <span className={s.profileText}>
            <span className={s.profileName} style={{ display: "block" }}>
              {name}
            </span>
            <span className={s.profileRole}>{ROLE_LABEL[role]}</span>
          </span>
        </Link>
        {role === "client" && <BalanceChip block />}

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
                  {countOf(item, unread) ? <span className={s.navCount}>{countOf(item, unread)}</span> : null}
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

        <Button variant="primary" size="lg" block href={nav.cta.href} className={s.cta}>
          {nav.cta.label}
        </Button>
      </aside>

      <header className={s.mobileTop}>
        <Link href={root} className={s.brand}>
          <LogoMark className={s.brandMark} />
          aprosop
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {role === "client" && <BalanceChip compact />}
          <ThemeToggle />
          <Link href={PROFILE_HREF[role]} className={s.mobileProfile} aria-label={`${name}, открыть профиль`} title={name}>
            {user.psychologist ? (
              <SpecialistPhoto url={user.psychologist.photo_url} name={name} size={36} alt="" />
            ) : (
              <AvatarThumb config={user.avatar_config} seed={user.id} size={36} />
            )}
          </Link>
          <Button
            variant="ghost"
            size="md"
            iconOnly
            aria-label={menuOpen ? "Закрыть меню" : "Открыть меню"}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            onClick={() => setMenuOpen((v) => !v)}
            icon={<Morph icon={menuOpen ? MI.X : MI.Menu} size={22} />}
          />
        </div>
      </header>

      {menuOpen && <button type="button" className={s.menuScrim} aria-label="Закрыть меню" onClick={() => setMenuOpen(false)} />}
      <nav id="mobile-menu" className={s.menuSheet} data-open={menuOpen ? "" : undefined} aria-label="Все разделы" aria-hidden={!menuOpen}>
        {(() => {
          let prev: string | undefined;
          return nav.items.map((item) => {
            const showGroup = item.group && item.group !== prev;
            prev = item.group;
            const Icon = item.icon;
            return (
              <div key={item.href}>
                {showGroup && <div className={s.navGroup}>{item.group}</div>}
                <Link
                  href={item.href}
                  tabIndex={menuOpen ? 0 : -1}
                  className={s.navItem}
                  aria-current={isActive(pathname, item.href, root) ? "page" : undefined}
                >
                  <Icon size={20} strokeWidth={1.8} />
                  {item.label}
                  {countOf(item, unread) ? <span className={s.navCount}>{countOf(item, unread)}</span> : null}
                </Link>
              </div>
            );
          });
        })()}
        <button type="button" tabIndex={menuOpen ? 0 : -1} className={`${s.navItem} ${s.menuLogout}`} onClick={onLogout}>
          <LogOut size={20} strokeWidth={1.8} />
          Выйти
        </button>
      </nav>

      <main className={s.main}>{children}</main>

      <nav className={s.tabbar} aria-label="Разделы">
        {nav.items
          .filter((i) => i.tab)
          .slice(0, 5)
          .map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} className={s.tab} aria-current={isActive(pathname, item.href, root, item.also) ? "page" : undefined}>
                <span className={s.tabIcon}>
                  <Icon size={22} strokeWidth={1.8} />
                  {countOf(item, unread) ? <span className={s.tabDot} aria-label={`${countOf(item, unread)} непрочитанных`} /> : null}
                </span>
                {item.tabLabel ?? item.label}
              </Link>
            );
          })}
      </nav>
    </div>
  );
}

function countOf(item: NavItem, unread: number): number | undefined {
  if (item.unread) return unread > 0 ? Math.min(unread, 99) : undefined;
  return item.count;
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
