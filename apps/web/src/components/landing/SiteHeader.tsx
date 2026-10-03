"use client";

import { t } from "@/lib/i18n";
import Link from "next/link";
import { useEffect, useState } from "react";
import { LogoMark } from "@/components/shell/Logo";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { LanguageToggle } from "@/components/i18n/LanguageSwitch";
import { LivingBackground } from "./LivingBackground";
import { lp } from "@/lib/i18n";
import { MI, Morph } from "@/components/ui/Morph";
import { homeFor, useAuth } from "@/lib/auth/store";
import { Button } from "@/ui";
import s from "./landing.module.css";

const LINKS = [
  { href: "/#how", get label() { return t("Как\u00a0это\u00a0работает"); } },
  { href: "/#specialists", get label() { return t("Специалисты"); } },
  { href: "/#circles", get label() { return t("Круги"); } },
  { href: "/articles", get label() { return t("Полезное"); } },
];

export function Brand() {
  return (
    <Link href={lp("/")} className={s.brand} aria-label={t("Aprosop, на\u00a0главную")}>
      <LogoMark className={s.brandMark} size={32} />
      Aprosop
    </Link>
  );
}

/** Public header: logo, four short links, theme switch and one call to action. On phones: logo, CTA, menu. */
export function SiteHeader({ links = true }: { links?: boolean }) {
  const status = useAuth((st) => st.status);
  const user = useAuth((st) => st.user);
  const [open, setOpen] = useState(false);
  // Fully transparent over the top of the page; frosted once the page has scrolled a little.
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    useAuth.getState().bootstrap();
  }, []);

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const authed = status === "authed" && user;

  return (
    <>
    <LivingBackground />
    <header className={s.header} data-open={open || undefined} data-scrolled={scrolled || undefined}>
      <div className={`${s.wrap} ${s.headerInner}`}>
        <Brand />
        {links && (
          <nav className={s.nav} aria-label={t("Разделы сайта")}>
            {LINKS.map((l) => (
              <a key={l.href} href={lp(l.href)} className={s.navLink}>
                {l.label}
              </a>
            ))}
          </nav>
        )}
        <div className={s.headerActions}>
          <LanguageToggle className={s.headerTheme} />
          <ThemeToggle className={s.headerTheme} />
          {authed ? (
            <Button href={homeFor(user.role)} variant="primary" size="sm" className={s.headerCta}>
              {t("Кабинет")}
            </Button>
          ) : (
            <>
              <Link href={lp("/login")} className={s.signIn}>
                {t("Войти")}
              </Link>
              <Button href={lp("/start")} variant="primary" size="sm" className={s.headerCta}>
                {t("Начать")}
              </Button>
            </>
          )}
          {links && (
            <button
              type="button"
              className={s.menuBtn}
              aria-label={open ? t("Закрыть меню") : t("Открыть меню")}
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
        <nav id="site-menu" className={s.menu} aria-label={t("Меню")}>
          {LINKS.map((l) => (
            <a key={l.href} href={lp(l.href)} className={s.menuLink} onClick={() => setOpen(false)}>
              {l.label}
            </a>
          ))}
          <div className={s.menuFoot}>
            {!authed && (
              <Link href={lp("/login")} className={s.menuLink} onClick={() => setOpen(false)}>
                {t("Войти")}
              </Link>
            )}
            <LanguageToggle />
            <ThemeToggle />
          </div>
        </nav>
      )}
    </header>
    </>
  );
}
