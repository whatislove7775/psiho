import type { Metadata } from "next";
import { LostBubble } from "@/components/illustrations";
import { Brand } from "@/components/landing/SiteHeader";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { Button } from "@/ui";
import s from "./status.module.css";

export const metadata: Metadata = { title: "Страница не найдена", robots: { index: false } };

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
          <span className={s.code}>Ошибка 404</span>
          <h1 className={s.title}>Такой страницы нет</h1>
          <p className={s.text}>Возможно, ссылка устарела или в адресе опечатка. Давайте вернёмся туда, где всё знакомо.</p>
          <div className={s.actions}>
            <Button href="/" variant="primary">
              На главную
            </Button>
            <Button href="/app" variant="secondary">
              В кабинет
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
