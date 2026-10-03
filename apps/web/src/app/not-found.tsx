import { t } from "@/lib/i18n";
import type { Metadata } from "next";
import { LostBubble } from "@/components/illustrations";
import { Brand } from "@/components/landing/SiteHeader";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { Button } from "@/ui";
import s from "./status.module.css";

export function generateMetadata(): Metadata {
  return { title: t("Страница не\u00a0найдена"), robots: { index: false } };
}

export default function NotFound() {
  return (
    <div className={s.page}>
      <header className={s.top}>
        <Brand />
        <ThemeToggle />
      </header>
      <main className={s.main}>
        <div className={s.card}>
          <LostBubble className={s.art} />
          <span className={s.code}>{t("Ошибка 404")}</span>
          <h1 className={s.title}>{t("Такой страницы нет")}</h1>
          <p className={s.text}>{t("Возможно, ссылка устарела или\u00a0в\u00a0адресе опечатка. Давайте вернёмся туда, где всё знакомо.")}</p>
          <div className={s.actions}>
            <Button href="/" variant="primary">
              {t("На\u00a0главную")}
            </Button>
            <Button href="/app" variant="secondary">
              {t("В\u00a0кабинет")}
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
