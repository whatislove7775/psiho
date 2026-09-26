import Link from "next/link";
import { LEGAL_DOCS } from "@/components/legal/docs";
import { Brand } from "./SiteHeader";
import s from "./landing.module.css";

export function SiteFooter() {
  return (
    <footer className={s.footer}>
      <div className={s.wrap}>
        <div className={s.footerGrid}>
          <div className={s.footerAbout}>
            <Brand />
            <p>
              Анонимные диалоги и видеосозвоны с психологом. Без почты и телефона, вместо лица 3D-аватар. Если вам прямо сейчас
              угрожает опасность, звоните 112.
            </p>
          </div>
          <div className={s.footerCol}>
            <h3>Клиентам</h3>
            <ul>
              <li>
                <Link href="/start">Начать анонимно</Link>
              </li>
              <li>
                <Link href="/login">Войти</Link>
              </li>
              <li>
                <Link href="/recover">Восстановить доступ</Link>
              </li>
            </ul>
          </div>
          <div className={s.footerCol}>
            <h3>Специалистам</h3>
            <ul>
              <li>
                <Link href="/join">Подать анкету</Link>
              </li>
              <li>
                <Link href="/login">Вход для специалистов</Link>
              </li>
            </ul>
          </div>
          <div className={s.footerCol}>
            <h3>Полезное</h3>
            <ul>
              <li>
                <Link href="/articles">Статьи</Link>
              </li>
              <li>
                <Link href="/practices">Практики</Link>
              </li>
              <li>
                <a href="mailto:support@aprosop.ru">support@aprosop.ru</a>
              </li>
            </ul>
          </div>
          <div className={s.footerCol}>
            <h3>
              <Link href="/legal">Документы</Link>
            </h3>
            <ul>
              {LEGAL_DOCS.map((d) => (
                <li key={d.slug}>
                  <Link href={`/legal/${d.slug}`}>{d.short}</Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className={s.footerBottom}>
          <span>© {new Date().getFullYear()} aprosop</span>
          <span>Сервис не заменяет экстренную медицинскую помощь.</span>
        </div>
      </div>
    </footer>
  );
}
