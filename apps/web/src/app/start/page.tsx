import type { Metadata } from "next";
import { StartForm } from "@/components/auth/StartForm";
import { ogMeta } from "@/lib/og/sections";

export const metadata: Metadata = {
  title: "Начать анонимно",
  description:
    "Анонимная регистрация без почты и телефона: только пароль. Имя и ключ восстановления создаются автоматически.",
  alternates: { canonical: "/start" },
  ...ogMeta("/start", "Начать анонимно", "Без почты и телефона: только пароль. Имя и ключ восстановления создаются сами."),
};

export default function StartPage() {
  return <StartForm />;
}
