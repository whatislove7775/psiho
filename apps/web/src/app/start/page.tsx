import type { Metadata } from "next";
import { StartForm } from "@/components/auth/StartForm";

export const metadata: Metadata = {
  title: "Начать анонимно",
  description:
    "Анонимная регистрация без почты и телефона: только пароль. Имя и ключ восстановления создаются автоматически.",
  alternates: { canonical: "/start" },
};

export default function StartPage() {
  return <StartForm />;
}
