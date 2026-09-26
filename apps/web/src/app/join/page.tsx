import type { Metadata } from "next";
import { JoinForm } from "@/components/auth/JoinForm";
import { ogMeta } from "@/lib/og/sections";

export const metadata: Metadata = {
  title: "Для психологов",
  description:
    "Анкета психолога для aprosop: анонимные диалоги и видеосозвоны с клиентами. Профиль появляется в каталоге после ручной проверки.",
  alternates: { canonical: "/join" },
  ...ogMeta("/join", "Для психологов", "Анонимные клиенты, диалоги и видеозвонки. Профиль появляется после ручной проверки."),
};

export default function JoinPage() {
  return <JoinForm />;
}
