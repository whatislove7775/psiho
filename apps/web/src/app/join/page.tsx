import type { Metadata } from "next";
import { JoinForm } from "@/components/auth/JoinForm";

export const metadata: Metadata = {
  title: "Для специалистов",
  description:
    "Анкета психолога для aprosop: анонимные диалоги и видеосозвоны с клиентами. Профиль появляется в каталоге после ручной проверки.",
  alternates: { canonical: "/join" },
};

export default function JoinPage() {
  return <JoinForm />;
}
