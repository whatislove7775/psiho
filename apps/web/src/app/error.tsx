"use client";

import { t } from "@/lib/i18n";
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
          <h1 className={s.title}>{t("Что-то пошло не\u00a0так")}</h1>
          <p className={s.text}>{t("Страница не\u00a0загрузилась. Попробуйте ещё раз: чаще всего помогает. Ваши данные в\u00a0безопасности.")}</p>
          <div className={s.actions}>
            <Button variant="primary" onClick={reset}>
              {t("Попробовать снова")}
            </Button>
            <Button href="/" variant="secondary">
              {t("На\u00a0главную")}
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
