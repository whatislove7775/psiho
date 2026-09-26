"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FocusEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import {
  BookOpen,
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
  Search,
  KeyRound,
  SlidersHorizontal,
  FileText,
  LifeBuoy,
  type LucideIcon,
} from "lucide-react";
import { UsersRound as CirclesIcon } from "lucide-react";
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
import { SearchTrigger } from "@/components/search/SpecialistSearch";
import { Island, islandItems } from "@/components/shell/Island";
import { syncPrivacyPrefs } from "@/lib/privacy/usePrivacy";
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
      // H2: групповые «Круги» (группы поддержки с психологом)
      { href: "/app/circles", label: "Круги", icon: CirclesIcon },
      // «Полезное»: статьи (первыми) и практики — одна страница с вкладками
      { href: "/app/articles", label: "Полезное", icon: BookOpen, tab: true, also: ["/app/practices"] },
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
      { href: "/pro/circles", label: "Круги", icon: CirclesIcon },
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
  // HR компании (B2B): только агрегаты своей компании
  business: {
    items: [
      { href: "/business/portal", label: "Сводка", icon: LayoutGrid, tab: true },
      { href: "/business/portal/codes", label: "Коды сотрудников", icon: KeyRound, tab: true, tabLabel: "Коды" },
      { href: "/business/portal/program", label: "Программа", icon: SlidersHorizontal, tab: true },
      { href: "/business/portal/documents", label: "Документы", icon: FileText, tab: true, group: "Компания" },
      { href: "/business/portal/support", label: "Поддержка", icon: LifeBuoy, group: "Компания" },
    ],
    cta: { label: "Выпустить коды", href: "/business/portal/codes" },
  },
};

const ROLE_LABEL: Record<Role, string> = {
  client: "Анонимный клиент",
  psychologist: "Специалист",
  admin: "Администратор",
  business: "HR компании",
};

/** Where the sidebar profile card leads. */
const PROFILE_HREF: Record<Role, string> = {
  client: "/app/profile",
  psychologist: "/pro/profile",
  admin: "/admin/account",
  business: "/business/portal/support",
};

/** Pages where the sidebar collapses to a slim icon rail (messenger layouts). */
const RAIL_ROUTES = /^\/(app|pro)\/dialogs(\/|$)/;

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
  const [tip, setTip] = useState<{ text: string; top: number; left: number } | null>(null);
  const rail = RAIL_ROUTES.test(pathname);
  const unread = useUnread(status === "authed" && !!user && user.role === role && role !== "admin" && role !== "business", pathname);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    setMenuOpen(false);
    setTip(null);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [menuOpen]);

  // «Незаметный режим» / «Защита от скриншотов»: подтянуть настройки из аккаунта (новее — побеждает)
  useEffect(() => {
    if (status === "authed" && user?.role === role) syncPrivacyPrefs();
  }, [status, user, role]);

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

  // Rail tooltips: one fixed bubble next to the hovered / focused icon (not clipped by the nav scroller)
  const showTip = (e: ReactMouseEvent<HTMLElement> | FocusEvent<HTMLElement>) => {
    if (!rail) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-tip]");
    if (!el) return;
    let text = el.dataset.tip || "";
    if (text === "@balance") text = (el.querySelector("a")?.getAttribute("aria-label") ?? "Баланс").replace(/\. Открыть$/, "");
    const r = el.getBoundingClientRect();
    setTip({ text, top: r.top + r.height / 2, left: r.right + 10 });
  };
  const hideTip = () => setTip(null);

  return (
    <div className={s.root} data-rail={rail ? "" : undefined}>
      <aside
        className={s.sidebar}
        aria-label="Навигация кабинета"
        onMouseOver={showTip}
        onMouseLeave={hideTip}
        onFocus={showTip}
        onBlur={hideTip}
      >
        {/* Theme switch lives here in every cabinet: one stable spot that never overlaps content */}
        <div className={s.brandRow}>
          <Link href="/" className={s.brand} data-tip="На главную сайта">
            <LogoMark className={s.brandMark} />
            <span className={s.label}>aprosop</span>
          </Link>
          <ThemeToggle className={s.topToggle} />
        </div>

        <Link href={PROFILE_HREF[role]} className={s.profile} title={rail ? undefined : `${name}, открыть профиль`} data-tip={name}>
          <span className={s.profileAvatar}>
            {user.psychologist ? (
              <SpecialistPhoto url={user.psychologist.photo_url} name={name} size={48} alt="" />
            ) : (
              <AvatarThumb config={user.avatar_config} seed={user.id} size={48} />
            )}
          </span>
          <span className={`${s.profileText} ${s.label}`}>
            <span className={s.profileName} style={{ display: "block" }}>
              {name}
            </span>
            <span className={s.profileRole}>{ROLE_LABEL[role]}</span>
          </span>
        </Link>
        {role === "client" && (
          <div className={s.balance} data-tip="@balance">
            <BalanceChip block />
          </div>
        )}

        <nav className={s.nav}>
          {nav.items.map((item) => {
            const showGroup = item.group && item.group !== lastGroup;
            lastGroup = item.group;
            const Icon = item.icon;
            return (
              <div key={item.href}>
                {showGroup && <div className={s.navGroup}>{item.group}</div>}
                <Link
                  href={item.href}
                  className={s.navItem}
                  aria-current={isActive(pathname, item.href, root, item.also) ? "page" : undefined}
                  aria-label={rail ? item.label : undefined}
                  data-tip={item.label}
                >
                  <Icon size={20} strokeWidth={1.8} />
                  <span className={s.label}>{item.label}</span>
                  {countOf(item, unread) ? <span className={s.navCount}>{countOf(item, unread)}</span> : null}
                </Link>
              </div>
            );
          })}
          <div style={{ flex: 1 }} />
          <div className={s.railToggle} data-tip="Сменить тему">
            <ThemeToggle />
          </div>
          <button
            type="button"
            className={s.navItem}
            onClick={onLogout}
            style={{ border: 0, background: "none", width: "100%" }}
            aria-label={rail ? "Выйти" : undefined}
            data-tip="Выйти"
          >
            <LogOut size={20} strokeWidth={1.8} />
            <span className={s.label}>Выйти</span>
          </button>
        </nav>

        {role === "client" ? (
          // opens the specialist search palette (morphs out of this button); ⌘K / Ctrl+K anywhere
          <SearchTrigger variant="primary" size="lg" block className={s.cta} fallbackHref={nav.cta.href} hotkeyHint>
            {nav.cta.label}
          </SearchTrigger>
        ) : (
          <Button variant="primary" size="lg" block href={nav.cta.href} className={s.cta}>
            {nav.cta.label}
          </Button>
        )}
      </aside>
      {rail && tip && (
        <div className={s.tip} role="tooltip" style={{ top: tip.top, left: tip.left }}>
          {tip.text}
        </div>
      )}

      <header className={s.mobileTop}>
        <Link href={root} className={s.brand}>
          <LogoMark className={s.brandMark} />
          aprosop
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {role === "client" && <BalanceChip compact />}
          {role === "client" && (
            <SearchTrigger variant="ghost" size="md" iconOnly aria-label="Найти специалиста" icon={<Search size={21} strokeWidth={1.9} />} />
          )}
          <ThemeToggle />
          {/* profile lives in the bottom island on phones */}
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
                  aria-current={isActive(pathname, item.href, root, item.also) ? "page" : undefined}
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

      {/* Mobile: floating «island» navigation (+ quick-exit button of the stealth mode) */}
      <Island
        items={islandItems(
          role,
          (href, also) => isActive(pathname, href, root, also),
          unread,
          user.psychologist ? (
            <SpecialistPhoto url={user.psychologist.photo_url} name={name} size={26} alt="" />
          ) : (
            <AvatarThumb config={user.avatar_config} seed={user.id} size={26} />
          ),
        )}
      />
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
