"use client";

import { useEffect } from "react";
import { SleepingMoon } from "@/components/illustrations";
import { Button } from "@/ui";
import s from "./status.module.css";

/** Friendly fallback for unexpected rendering errors. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Only the message: never user content.
    console.error(error.message);
  }, [error]);
  return (
    <div className={s.page}>
      <main className={s.main}>
        <div className={s.card}>
          <SleepingMoon className={s.art} />
          <h1 className={s.title}>Что-то пошло не так</h1>
          <p className={s.text}>Страница не загрузилась. Попробуйте ещё раз: чаще всего помогает. Ваши данные в безопасности.</p>
          <div className={s.actions}>
            <Button variant="primary" onClick={reset}>
              Попробовать снова
            </Button>
            <Button href="/" variant="secondary">
              На главную
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
