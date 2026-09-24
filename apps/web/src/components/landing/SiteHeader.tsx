"use client";

import Link from "next/link";
import { useEffect } from "react";
import { LogoMark } from "@/components/shell/Logo";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { homeFor, useAuth } from "@/lib/auth/store";
import { Button } from "@/ui";
import s from "./landing.module.css";

const LINKS = [
  { href: "/#privacy", label: "Анонимность" },
  { href: "/#how", label: "Как проходит сессия" },
  { href: "/#specialists", label: "Специалисты" },
  { href: "/#faq", label: "Вопросы" },
];

export function Brand() {
  return (
    <Link href="/" className={s.brand} aria-label="aprosop, на главную">
      <LogoMark className={s.brandMark} size={22} />
      aprosop
    </Link>
  );
}

/** Public header: logo, anchor links, theme switch, sign-in (or cabinet when signed in). */
export function SiteHeader({ links = true }: { links?: boolean }) {
  const status = useAuth((st) => st.status);
  const user = useAuth((st) => st.user);

  useEffect(() => {
    useAuth.getState().bootstrap();
  }, []);

  return (
    <header className={s.header}>
      <div className={`${s.wrap} ${s.headerInner}`}>
        <Brand />
        {links && (
          <nav className={s.nav} aria-label="Разделы главной страницы">
            {LINKS.map((l) => (
              <a key={l.href} href={l.href} className={s.navLink}>
                {l.label}
              </a>
            ))}
          </nav>
        )}
        <div className={s.headerActions}>
          <ThemeToggle />
          {status === "authed" && user ? (
            <Button href={homeFor(user.role)} variant="secondary">
              Открыть кабинет
            </Button>
          ) : (
            <Button href="/login" variant="secondary">
              Войти
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
