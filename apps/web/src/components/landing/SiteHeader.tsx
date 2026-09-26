"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LogoMark } from "@/components/shell/Logo";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { MI, Morph } from "@/components/ui/Morph";
import { homeFor, useAuth } from "@/lib/auth/store";
import { Button } from "@/ui";
import s from "./landing.module.css";

const LINKS = [
  { href: "/#how", label: "Как это работает" },
  { href: "/#specialists", label: "Специалисты" },
  { href: "/#circles", label: "Круги" },
  { href: "/articles", label: "Полезное" },
];

export function Brand() {
  return (
    <Link href="/" className={s.brand} aria-label="aprosop, на главную">
      <LogoMark className={s.brandMark} size={32} />
      aprosop
    </Link>
  );
}

/** Public header: logo, four short links, theme switch and one call to action. On phones: logo, CTA, menu. */
export function SiteHeader({ links = true }: { links?: boolean }) {
  const status = useAuth((st) => st.status);
  const user = useAuth((st) => st.user);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    useAuth.getState().bootstrap();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const authed = status === "authed" && user;

  return (
    <header className={s.header} data-open={open || undefined}>
      <div className={`${s.wrap} ${s.headerInner}`}>
        <Brand />
        {links && (
          <nav className={s.nav} aria-label="Разделы сайта">
            {LINKS.map((l) => (
              <a key={l.href} href={l.href} className={s.navLink}>
                {l.label}
              </a>
            ))}
          </nav>
        )}
        <div className={s.headerActions}>
          <ThemeToggle className={s.headerTheme} />
          {authed ? (
            <Button href={homeFor(user.role)} variant="primary" size="sm" className={s.headerCta}>
              Кабинет
            </Button>
          ) : (
            <>
              <Link href="/login" className={s.signIn}>
                Войти
              </Link>
              <Button href="/start" variant="primary" size="sm" className={s.headerCta}>
                Начать
              </Button>
            </>
          )}
          {links && (
            <button
              type="button"
              className={s.menuBtn}
              aria-label={open ? "Закрыть меню" : "Открыть меню"}
              aria-expanded={open}
              aria-controls="site-menu"
              onClick={() => setOpen((v) => !v)}
            >
              <Morph icon={open ? MI.X : MI.Menu} size={22} />
            </button>
          )}
        </div>
      </div>
      {links && open && (
        <nav id="site-menu" className={s.menu} aria-label="Меню">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className={s.menuLink} onClick={() => setOpen(false)}>
              {l.label}
            </a>
          ))}
          <div className={s.menuFoot}>
            {!authed && (
              <Link href="/login" className={s.menuLink} onClick={() => setOpen(false)}>
                Войти
              </Link>
            )}
            <ThemeToggle />
          </div>
        </nav>
      )}
    </header>
  );
}
