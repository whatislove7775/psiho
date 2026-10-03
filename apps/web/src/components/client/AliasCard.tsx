"use client";

import { t } from "@/lib/i18n";
import { KeyRound, UserRound } from "lucide-react";
import { Button } from "@/ui";
import { AvatarThumb } from "@/components/avatar/AvatarThumb";
import type { User } from "@/lib/api/types";
import s from "./rail.module.css";

/** Accent card for the privacy page: who you are here, and how to get back in. */
export function AliasCard({ user }: { user: User }) {
  return (
    <section className={s.accent} aria-label={t("Ваш псевдоним")}>
      <div className={s.person}>
        <AvatarThumb
          config={user.avatar_config}
          seed={user.id}
          size={72}
          background="rgba(255,255,255,0.18)"
        />
        <div className={s.personText}>
          <span>{t("Вы\u00a0здесь под\u00a0именем")}</span>
          <strong>{user.alias}</strong>
        </div>
      </div>
      <div className={s.rows}>
        <div className={s.row}>
          <span className={s.rowIcon} aria-hidden>
            <UserRound size={18} strokeWidth={1.8} />
          </span>
          <span className={s.rowText}>
            <strong>{t("Вход по\u00a0псевдониму и\u00a0паролю")}</strong>
            <span>{t("Почта и\u00a0телефон не\u00a0нужны")}</span>
          </span>
        </div>
        <div className={s.row}>
          <span className={s.rowIcon} aria-hidden>
            <KeyRound size={18} strokeWidth={1.8} />
          </span>
          <span className={s.rowText}>
            <strong>{t("Ключ восстановления")}</strong>
            <span>
              {t("Единственный способ вернуть доступ, если забудете пароль. Мы\u00a0не\u00a0сможем помочь без\u00a0него")}
            </span>
          </span>
        </div>
      </div>
      <Button variant="white" size="lg" block href="/app/avatar">
        {t("Изменить аватар")}
      </Button>
    </section>
  );
}
