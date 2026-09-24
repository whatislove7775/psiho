"use client";

import { KeyRound, UserRound } from "lucide-react";
import { Button } from "@/ui";
import { AvatarThumb } from "@/components/avatar/AvatarThumb";
import type { User } from "@/lib/api/types";
import s from "./rail.module.css";

/** Accent card for the privacy page: who you are here, and how to get back in. */
export function AliasCard({ user }: { user: User }) {
  return (
    <section className={s.accent} aria-label="Ваш псевдоним">
      <div className={s.person}>
        <AvatarThumb
          config={user.avatar_config}
          seed={user.id}
          size={72}
          background="rgba(255,255,255,0.18)"
        />
        <div className={s.personText}>
          <span>Вы здесь под именем</span>
          <strong>{user.alias}</strong>
        </div>
      </div>
      <div className={s.rows}>
        <div className={s.row}>
          <span className={s.rowIcon} aria-hidden>
            <UserRound size={18} strokeWidth={1.8} />
          </span>
          <span className={s.rowText}>
            <strong>Вход по псевдониму и паролю</strong>
            <span>Почта и телефон не нужны</span>
          </span>
        </div>
        <div className={s.row}>
          <span className={s.rowIcon} aria-hidden>
            <KeyRound size={18} strokeWidth={1.8} />
          </span>
          <span className={s.rowText}>
            <strong>Ключ восстановления</strong>
            <span>
              Единственный способ вернуть доступ, если забудете пароль. Мы не
              сможем помочь без него
            </span>
          </span>
        </div>
      </div>
      <Button variant="white" size="lg" block href="/app/avatar">
        Изменить аватар
      </Button>
    </section>
  );
}
