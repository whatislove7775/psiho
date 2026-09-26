"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  BadgeCheck,
  Building2,
  CalendarDays,
  Flag,
  FileText,
  FileCheck2,
  MessageSquareQuote,
  FlaskConical,
  Wallet,
  Headset,
  KeyRound,
  LayoutGrid,
  LogOut,
  Menu,
  ScrollText,
  ShieldAlert,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";
import { UsersRound as CirclesIcon } from "lucide-react";
import { Button, EmptyState, Modal, Spinner } from "@/ui";
import { homeFor, useAuth } from "@/lib/auth/store";
import { ApiError } from "@/lib/api/client";
import { staffApi, type StaffMe, type StaffPermission } from "@/lib/api/staff";
import { AvatarThumb } from "@/components/avatar/AvatarThumb";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { LogoMark } from "@/components/shell/Logo";
import { StaffGate } from "./StaffGate";
import sh from "@/components/shell/AppShell.module.css";
import s from "./staff.module.css";
import { EmptyArt } from "@/components/illustrations";

type Badges = Partial<Record<"reports" | "specialists" | "support" | "credentials" | "circles", number>>;
type Me = StaffMe & { badges?: Badges };

interface StaffCtx {
  me: Me;
  can: (perm: StaffPermission) => boolean;
  reload: () => Promise<void>;
}

const Ctx = createContext<StaffCtx | null>(null);

export function useStaff(): StaffCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStaff outside AdminShell");
  return v;
}

interface Item {
  href: string;
  label: string;
  short?: string;
  icon: LucideIcon;
  perm: StaffPermission;
  group?: string;
  badge?: keyof Badges;
}

/** Staff console navigation. /admin/content (A1) and /admin/support (A4) live in the same shell. */
const ITEMS: Item[] = [
  { href: "/admin", label: "Сводка", icon: LayoutGrid, perm: "dashboard.view" },
  { href: "/admin/users", label: "Пользователи", icon: Users, perm: "users.view", group: "Платформа" },
  { href: "/admin/specialists", label: "Специалисты", icon: BadgeCheck, perm: "specialists.view", group: "Платформа", badge: "specialists" },
  { href: "/admin/credentials", label: "Документы", icon: FileCheck2, perm: "specialists.verify", group: "Платформа", badge: "credentials" },
  { href: "/admin/circles", label: "Круги", icon: CirclesIcon, perm: "specialists.verify", group: "Платформа", badge: "circles" },
  { href: "/admin/sessions", label: "Созвоны", icon: CalendarDays, perm: "sessions.view", group: "Платформа" },
  { href: "/admin/finance", label: "Финансы", icon: Wallet, perm: "finance.view", group: "Платформа" },
  { href: "/admin/business", label: "Компании", icon: Building2, perm: "business.view", group: "Платформа" },
  { href: "/admin/moderation", label: "Жалобы", icon: Flag, perm: "reports.view", group: "Забота", badge: "reports" },
  { href: "/admin/reviews", label: "Отзывы", icon: MessageSquareQuote, perm: "reports.view", group: "Забота" },
  { href: "/admin/support", label: "Поддержка", icon: Headset, perm: "support.inbox", group: "Забота", badge: "support" },
  { href: "/admin/content", label: "Материалы", icon: FileText, perm: "content.edit", group: "Забота" },
  { href: "/admin/staff", label: "Сотрудники", icon: UserCog, perm: "staff.view", group: "Команда" },
  { href: "/admin/audit", label: "Журнал действий", short: "Журнал", icon: ScrollText, perm: "audit.view", group: "Команда" },
  { href: "/admin/system", label: "Система", icon: Activity, perm: "system.view", group: "Команда" },
  { href: "/admin/lab", label: "Лаборатория", icon: FlaskConical, perm: "lab.use", group: "Команда" },
];

const ACCOUNT: Item = { href: "/admin/account", label: "Мой доступ", icon: KeyRound, perm: "dashboard.view" };

function isActive(pathname: string, href: string) {
  return href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(href + "/");
}

/** Old route kept working: /admin/psychologists → «Специалисты». */
function activeHref(pathname: string) {
  return pathname.startsWith("/admin/psychologists") ? "/admin/specialists" : pathname;
}

export function AdminShell({ children }: { children: ReactNode }) {
  const { user, status, bootstrap, logout } = useAuth();
  const rawPath = usePathname() ?? "";
  const pathname = activeHref(rawPath);
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [meError, setMeError] = useState<string | null>(null);
  const [more, setMore] = useState(false);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (status === "guest") router.replace(`/login?next=${encodeURIComponent(rawPath)}`);
  }, [status, router, rawPath]);

  const reload = useCallback(async () => {
    try {
      setMe((await staffApi.me()) as Me);
      setMeError(null);
    } catch (e) {
      setMeError(
        e instanceof ApiError && e.status === 403
          ? "Этот аккаунт не входит в команду сервиса или доступ отключён."
          : `${(e as Error).message} Обновите страницу.`,
      );
    }
  }, []);

  useEffect(() => {
    if (status === "authed" && user?.role === "admin") reload();
  }, [status, user, reload]);

  // Refresh nav counters when moving between sections.
  useEffect(() => {
    if (me) staffApi.me().then((m) => setMe(m as Me)).catch(() => {});
    setMore(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawPath]);

  const ctx = useMemo<StaffCtx | null>(
    () => (me ? { me, can: (p) => me.permissions.includes(p), reload } : null),
    [me, reload],
  );

  const onLogout = () => {
    logout();
    router.replace("/");
  };

  // Signed in with a client/specialist account: explain instead of silently redirecting.
  if (status === "authed" && user && user.role !== "admin") {
    return (
      <div className={sh.guard}>
        <EmptyState art={<EmptyArt scene="shield" />}
          icon={<ShieldAlert size={22} />}
          title="Это вход для команды сервиса"
          text={`Сейчас вы вошли как ${user.role === "psychologist" ? "специалист" : "клиент"}. Чтобы открыть админку, войдите под аккаунтом сотрудника (например, admin).`}
          action={
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
              <Button
                onClick={() => {
                  logout();
                  router.replace(`/login?next=${encodeURIComponent(rawPath || "/admin")}`);
                }}
                icon={<LogOut size={18} />}
              >
                Выйти и войти как сотрудник
              </Button>
              <Button variant="secondary" onClick={() => router.replace(homeFor(user.role))}>
                Вернуться в кабинет
              </Button>
            </div>
          }
        />
      </div>
    );
  }

  if (status !== "authed" || !user || user.role !== "admin" || (!me && !meError)) {
    return (
      <div className={sh.guard}>
        <Spinner />
      </div>
    );
  }

  if (!ctx || !me) {
    return (
      <div className={sh.guard}>
        <EmptyState art={<EmptyArt scene="shield" />}
          icon={<ShieldAlert size={22} />}
          title="Нет доступа к консоли"
          text={meError}
          action={
            <Button variant="secondary" onClick={onLogout} icon={<LogOut size={18} />}>
              Выйти
            </Button>
          }
        />
      </div>
    );
  }

  const gated = me.must_change_password || (me.totp_required && !me.totp_enabled);
  const items = gated ? [] : ITEMS.filter((i) => ctx.can(i.perm));
  const tabs = items.slice(0, 3);

  const navLinks = (onPick?: () => void) => {
    let lastGroup: string | undefined;
    return [...items, ...(gated ? [] : [ACCOUNT])].map((item) => {
      const showGroup = item.group && item.group !== lastGroup;
      lastGroup = item.group;
      const Icon = item.icon;
      const count = item.badge ? me.badges?.[item.badge] : undefined;
      return (
        <div key={item.href}>
          {showGroup && <div className={sh.navGroup}>{item.group}</div>}
          {item === ACCOUNT && <div className={s.navSpacer} />}
          <Link
            href={item.href}
            className={sh.navItem}
            aria-current={isActive(pathname, item.href) ? "page" : undefined}
            onClick={onPick}
          >
            <Icon size={20} strokeWidth={1.8} />
            {item.label}
            {count ? <span className={sh.navCount}>{count}</span> : null}
          </Link>
        </div>
      );
    });
  };

  return (
    <Ctx.Provider value={ctx}>
      <div className={sh.root}>
        <aside className={sh.sidebar} aria-label="Навигация консоли">
          <div className={sh.brandRow}>
            <Link href="/" className={sh.brand}>
              <LogoMark className={sh.brandMark} />
              aprosop
            </Link>
            <span style={{ display: "flex", gap: 2 }}>
              <ThemeToggle />
              <Button variant="ghost" size="md" iconOnly aria-label="Выйти" title="Выйти" onClick={onLogout} icon={<LogOut size={20} />} />
            </span>
          </div>

          <Link href="/admin/account" className={sh.profile} title="Мой доступ и двухфакторная защита">
            <span className={sh.profileAvatar}>
              <AvatarThumb config={user.avatar_config} seed={user.id} size={48} />
            </span>
            <span className={sh.profileText}>
              <span className={sh.profileName} style={{ display: "block" }}>
                {user.alias}
              </span>
              <span className={sh.profileRole}>{me.role_label}</span>
            </span>
          </Link>

          <nav className={sh.nav}>
            {navLinks()}
          </nav>
        </aside>

        <header className={sh.mobileTop}>
          <Link href="/admin" className={sh.brand}>
            <LogoMark className={sh.brandMark} />
            aprosop
          </Link>
          <div style={{ display: "flex", gap: 4 }}>
            <ThemeToggle />
            <Button variant="ghost" size="md" iconOnly aria-label="Выйти" onClick={onLogout} icon={<LogOut size={20} />} />
          </div>
        </header>

        <main className={sh.main}>{gated ? <StaffGate me={me} onDone={reload} /> : children}</main>

        {!gated && (
          <nav className={sh.tabbar} aria-label="Разделы">
            {tabs.map((item) => {
              const Icon = item.icon;
              const count = item.badge ? me.badges?.[item.badge] : undefined;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`${sh.tab} ${s.tab}`}
                  aria-current={isActive(pathname, item.href) ? "page" : undefined}
                >
                  <Icon size={22} strokeWidth={1.8} />
                  {item.short ?? item.label}
                  {count ? <span className={s.tabDot} aria-label={`${count} новых`} /> : null}
                </Link>
              );
            })}
            <button
              type="button"
              className={`${sh.tab} ${s.tab} ${s.tabButton}`}
              onClick={() => setMore(true)}
              aria-haspopup="dialog"
              aria-current={!tabs.some((t) => isActive(pathname, t.href)) ? "page" : undefined}
            >
              <Menu size={22} strokeWidth={1.8} />
              Ещё
            </button>
          </nav>
        )}

        <Modal open={more} onClose={() => setMore(false)} title="Разделы консоли">
          <div className={s.sheetNav}>{navLinks(() => setMore(false))}</div>
        </Modal>
      </div>
    </Ctx.Provider>
  );
}

/** Wrap a page body: shows a calm «no access» state instead of a failing request. */
export function RequirePerm({ perm, children }: { perm: StaffPermission; children: ReactNode }) {
  const { can, me } = useStaff();
  if (can(perm)) return <>{children}</>;
  return (
    <EmptyState art={<EmptyArt scene="shield" />}
      icon={<ShieldAlert size={22} />}
      title="Раздел недоступен для вашей роли"
      text={`Ваша роль: ${me.role_label.toLowerCase()}. Если доступ нужен для работы, попросите владельца или администратора изменить роль.`}
      action={
        <Button variant="secondary" href="/admin">
          На сводку
        </Button>
      }
    />
  );
}
