"use client";

import { t as tt } from "@/lib/i18n";
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
      { href: "/app", get label() { return tt("Главная"); }, icon: LayoutGrid, tab: true },
      { href: "/app/specialists", get label() { return tt("Специалисты"); }, icon: Users, tab: true },
      { href: "/app/dialogs", get label() { return tt("Диалоги"); }, icon: MessagesSquare, tab: true, unread: true },
      // H2: групповые «Круги» (группы поддержки с психологом)
      { href: "/app/circles", get label() { return tt("Круги"); }, icon: CirclesIcon },
      // «Полезное»: статьи (первыми) и практики — одна страница с вкладками
      { href: "/app/articles", get label() { return tt("Полезное"); }, icon: BookOpen, tab: true, also: ["/app/practices"] },
      // Аватар, зеркало и приватность — одна страница с вкладками
      { href: "/app/avatar", get label() { return tt("Аватар"); }, icon: Smile, tab: true, get group() { return tt("Анонимность"); } },
      { href: "/app/balance", get label() { return tt("Баланс"); }, icon: Wallet, get group() { return tt("Анонимность"); } },
    ],
    cta: { get label() { return tt("Найти специалиста"); }, href: "/app/specialists" },
  },
  psychologist: {
    items: [
      { href: "/pro", get label() { return tt("Сводка"); }, icon: LayoutGrid, tab: true },
      { href: "/pro/dialogs", get label() { return tt("Диалоги"); }, icon: MessagesSquare, tab: true, unread: true },
      { href: "/pro/schedule", get label() { return tt("Расписание"); }, icon: CalendarClock, tab: true },
      { href: "/pro/circles", get label() { return tt("Круги"); }, icon: CirclesIcon },
      { href: "/pro/articles", get label() { return tt("Мои статьи"); }, icon: BookOpen },
      { href: "/pro/profile", get label() { return tt("Профиль"); }, icon: UserRound, tab: true, get group() { return tt("Кабинет"); } },
      { href: "/pro/earnings", get label() { return tt("Доходы"); }, icon: Banknote, get group() { return tt("Кабинет"); } },
      { href: "/pro/check", get label() { return tt("Проверка камеры"); }, icon: Camera, tab: true, get tabLabel() { return tt("Камера"); }, get group() { return tt("Кабинет"); } },
    ],
    cta: { get label() { return tt("Открыть расписание"); }, href: "/pro/schedule" },
  },
  admin: {
    items: [
      { href: "/admin", get label() { return tt("Сводка"); }, icon: LayoutGrid, tab: true },
      { href: "/admin/psychologists", get label() { return tt("Проверка специалистов"); }, icon: BadgeCheck, tab: true },
      { href: "/admin/sessions", get label() { return tt("Созвоны"); }, icon: CalendarDays, tab: true },
    ],
    cta: { get label() { return tt("Проверить заявки"); }, href: "/admin/psychologists" },
  },
  // HR компании (B2B): только агрегаты своей компании
  business: {
    items: [
      { href: "/business/portal", get label() { return tt("Сводка"); }, icon: LayoutGrid, tab: true },
      { href: "/business/portal/codes", get label() { return tt("Коды сотрудников"); }, icon: KeyRound, tab: true, get tabLabel() { return tt("Коды"); } },
      { href: "/business/portal/program", get label() { return tt("Программа"); }, icon: SlidersHorizontal, tab: true },
      { href: "/business/portal/documents", get label() { return tt("Документы"); }, icon: FileText, tab: true, get group() { return tt("Компания"); } },
      { href: "/business/portal/support", get label() { return tt("Поддержка"); }, icon: LifeBuoy, get group() { return tt("Компания"); } },
    ],
    cta: { get label() { return tt("Выпустить коды"); }, href: "/business/portal/codes" },
  },
};

const ROLE_LABEL: Record<Role, string> = {
  get client() { return tt("Анонимный клиент"); },
  get psychologist() { return tt("Специалист"); },
  get admin() { return tt("Администратор"); },
  get business() { return tt("HR компании"); },
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
    if (text === "@balance") text = (el.querySelector("a")?.getAttribute("aria-label") ?? tt("Баланс")).replace(/\. Открыть$/, "");
    const r = el.getBoundingClientRect();
    setTip({ text, top: r.top + r.height / 2, left: r.right + 10 });
  };
  const hideTip = () => setTip(null);

  return (
    <div className={s.root} data-rail={rail ? "" : undefined}>
      <aside
        className={s.sidebar}
        aria-label={tt("Навигация кабинета")}
        onMouseOver={showTip}
        onMouseLeave={hideTip}
        onFocus={showTip}
        onBlur={hideTip}
      >
        {/* Theme switch lives here in every cabinet: one stable spot that never overlaps content */}
        <div className={s.brandRow}>
          <Link href="/" className={s.brand} data-tip={tt("На\u00a0главную сайта")}>
            <LogoMark className={s.brandMark} />
            <span className={s.label}>Aprosop</span>
          </Link>
          <ThemeToggle className={s.topToggle} />
        </div>

        <Link href={PROFILE_HREF[role]} className={s.profile} title={rail ? undefined : tt(`{name}, открыть профиль`, { name })} data-tip={name}>
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
          <div className={s.railToggle} data-tip={tt("Сменить тему")}>
            <ThemeToggle />
          </div>
          <button
            type="button"
            className={s.navItem}
            onClick={onLogout}
            style={{ border: 0, background: "none", width: "100%" }}
            aria-label={rail ? tt("Выйти") : undefined}
            data-tip={tt("Выйти")}
          >
            <LogOut size={20} strokeWidth={1.8} />
            <span className={s.label}>{tt("Выйти")}</span>
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
          Aprosop
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {/* search lives in the island on phones */}
          <ThemeToggle />
          {role === "client" && <BalanceChip compact />}
          {/* profile lives in the bottom island on phones */}
          <Button
            variant="ghost"
            size="md"
            iconOnly
            aria-label={menuOpen ? tt("Закрыть меню") : tt("Открыть меню")}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            onClick={() => setMenuOpen((v) => !v)}
            icon={<Morph icon={menuOpen ? MI.X : MI.Menu} size={22} />}
          />
        </div>
      </header>

      {menuOpen && <button type="button" className={s.menuScrim} aria-label={tt("Закрыть меню")} onClick={() => setMenuOpen(false)} />}
      <nav id="mobile-menu" className={s.menuSheet} data-open={menuOpen ? "" : undefined} aria-label={tt("Все разделы")} aria-hidden={!menuOpen}>
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
          {tt("Выйти")}
        </button>
      </nav>

      <main className={s.main}>{children}</main>

      {/* Mobile: floating «island» navigation (+ quick-exit button of the stealth mode) */}
      <Island
        items={islandItems(role, (href, also) => isActive(pathname, href, root, also), unread)}
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
