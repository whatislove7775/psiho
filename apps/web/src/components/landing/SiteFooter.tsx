import Link from "next/link";
import { Brand } from "./SiteHeader";
import s from "./landing.module.css";

const LINKS = [
  { href: "/articles", label: "Статьи" },
  { href: "/practices", label: "Практики" },
  { href: "/match", label: "Подбор по анкете" },
  { href: "/join", label: "Специалистам" },
  { href: "/business", label: "Для компаний" },
  { href: "/recover", label: "Восстановить доступ" },
  { href: "/legal", label: "Документы" },
];

/** Quiet footer: brand, one row of plain links, a single bottom line. */
export function SiteFooter() {
  return (
    <footer className={s.footer}>
      <div className={s.wrap}>
        <div className={s.footerTop}>
          <Brand />
          <nav className={s.footerLinks} aria-label="Ссылки">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href}>
                {l.label}
              </Link>
            ))}
            <a href="mailto:support@aprosop.ru">support@aprosop.ru</a>
          </nav>
        </div>
        <div className={s.footerBottom}>
          <span>© {new Date().getFullYear()} aprosop</span>
          <span>Не заменяет экстренную помощь. Если вам угрожает опасность, звоните 112.</span>
        </div>
      </div>
    </footer>
  );
}
