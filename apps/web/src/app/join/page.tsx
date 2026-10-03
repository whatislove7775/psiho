import { t } from "@/lib/i18n";
import type { Metadata } from "next";
import { JoinForm } from "@/components/auth/JoinForm";
import { ogMeta } from "@/lib/og/sections";

export function generateMetadata(): Metadata {
  return {
    title: t("Для\u00a0психологов"),
    description:
      t("Анкета психолога для\u00a0Aprosop: анонимные диалоги и\u00a0видеосозвоны с\u00a0клиентами. Профиль появляется в\u00a0каталоге после ручной проверки."),
    alternates: { canonical: "/join" },
    ...ogMeta("/join", t("Для\u00a0психологов"), t("Анонимные клиенты, диалоги и\u00a0видеозвонки. Профиль появляется после ручной проверки.")),
  };
}

export default function JoinPage() {
  return <JoinForm />;
}
