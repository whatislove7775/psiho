import { t } from "@/lib/i18n";
import Link from "next/link";
import { Brand } from "./SiteHeader";
import { LanguageToggle } from "@/components/i18n/LanguageSwitch";
import { CookieNotice } from "@/components/legal/CookieNotice";
import { lp } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n";
import s from "./landing.module.css";

const LINKS = [
  { href: "/articles", get label() { return t("Статьи"); } },
  { href: "/practices", get label() { return t("Практики"); } },
  { href: "/match", get label() { return t("Подбор по\u00a0анкете"); } },
  { href: "/join", get label() { return t("Специалистам"); } },
  { href: "/business", get label() { return t("Для\u00a0компаний"); } },
  { href: "/recover", get label() { return t("Восстановить доступ"); } },
  { href: "/legal", get label() { return t("Документы"); } },
];

/** Quiet footer: brand, one row of plain links, a single bottom line. */
export function SiteFooter() {
  return (
    <footer className={s.footer}>
      <div className={s.wrap}>
        <div className={s.footerTop}>
          <Brand />
          <nav className={s.footerLinks} aria-label={t("Ссылки")}>
            {/* «Для компаний» is a Russian B2B programme (invoices, acts in RUB) — not offered in other languages yet */}
            {LINKS.filter((l) => l.href !== "/business" || getLocale() === "ru").map((l) => (
              <Link key={l.href} href={lp(l.href)}>
                {l.label}
              </Link>
            ))}
            <a href="mailto:support@aprosop.ru">support@aprosop.ru</a>
            <LanguageToggle className={s.footerLang} />
          </nav>
        </div>
        <div className={s.footerBottom}>
          <span>© {new Date().getFullYear()} Aprosop</span>
          <span>{t("Не\u00a0заменяет экстренную помощь. Если вам угрожает опасность, звоните 112.")}</span>
        </div>
      </div>
      <CookieNotice />
    </footer>
  );
}
