"use client";

import { t } from "@/lib/i18n";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { EyeOff } from "lucide-react";
import { useToast } from "@/ui";
import { PageHeader } from "@/components/shell/AppShell";
import { useAuth } from "@/lib/auth/store";
import type { AvatarConfig } from "@/lib/avatar/schema";
import { AvatarStudio } from "./AvatarStudio";
import s from "./AvatarStudioPage.module.css";

const COPY = {
  client: {
    get sub() { return t("Этот аватар заменяет ваше лицо на\u00a0видеосозвонах и\u00a0везде в\u00a0сервисе. Камера передаёт только мимику, а\u00a0специалист видит аватар."); },
    get welcomeTitle() { return t("Соберите лицо, которое увидит специалист."); },
    home: "/app",
  },
  pro: {
    get sub() { return t("Этот аватар заменяет ваше лицо на\u00a0видеосозвонах и\u00a0в\u00a0каталоге специалистов. Камера передаёт только мимику, клиенты видят аватар."); },
    get welcomeTitle() { return t("Соберите лицо, которое увидят клиенты."); },
    home: "/pro",
  },
};

function Inner({ variant }: { variant: "client" | "pro" }) {
  const user = useAuth((st) => st.user);
  const toast = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const welcome = params?.get("welcome") === "1";
  const [saving, setSaving] = useState(false);
  const copy = COPY[variant];

  if (!user) return null; // AppShell renders a spinner until the user is loaded

  const onSave = async (cfg: AvatarConfig) => {
    setSaving(true);
    try {
      await useAuth.getState().setAvatar(cfg);
      toast(t("Аватар сохранён"));
      if (welcome) router.push(copy.home);
    } catch (e) {
      toast(t("Не\u00a0удалось сохранить аватар. Проверьте соединение и\u00a0попробуйте ещё раз."), { error: true });
      throw e;
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader title={t("Мой аватар")} sub={copy.sub} />
      {welcome && (
        <div className={s.welcome}>
          <span className={s.welcomeIcon} aria-hidden>
            <EyeOff size={22} strokeWidth={1.8} />
          </span>
          <div>
            <p className={s.welcomeTitle}>{copy.welcomeTitle}</p>
            <p className={s.welcomeText}>
              {t("Настоящее лицо останется только у\u00a0вас. Выберите причёску, цвет глаз, очки, что\u00a0угодно. Всё можно поменять позже.")}
            </p>
          </div>
        </div>
      )}
      <AvatarStudio initial={user.avatar_config} seed={user.id} onSave={onSave} saving={saving} variant={variant} />
    </>
  );
}

/** /app/avatar and /pro/avatar: header, optional welcome card, studio. */
export function AvatarStudioPage({ variant }: { variant: "client" | "pro" }) {
  return (
    <Suspense fallback={null}>
      <Inner variant={variant} />
    </Suspense>
  );
}
