import { t } from "@/lib/i18n";
import type { Metadata } from "next";
import { StartForm } from "@/components/auth/StartForm";
import { ogMeta } from "@/lib/og/sections";

export function generateMetadata(): Metadata {
  return {
    title: t("Начать анонимно"),
    description:
      t("Анонимная регистрация без\u00a0почты и\u00a0телефона: только пароль. Имя и\u00a0ключ восстановления создаются автоматически."),
    alternates: { canonical: "/start" },
    ...ogMeta("/start", t("Начать анонимно"), t("Без\u00a0почты и\u00a0телефона: только пароль. Имя и\u00a0ключ восстановления создаются сами.")),
  };
}

export default function StartPage() {
  return <StartForm />;
}
