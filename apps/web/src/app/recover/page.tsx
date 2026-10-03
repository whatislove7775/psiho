import { t } from "@/lib/i18n";
import type { Metadata } from "next";
import { RecoverForm } from "@/components/auth/RecoverForm";
import { ogMeta } from "@/lib/og/sections";

export function generateMetadata(): Metadata {
  return {
    title: t("Восстановить доступ"),
    description: t("Смена пароля по\u00a0имени и\u00a0ключу восстановления."),
    alternates: { canonical: "/recover" },
    ...ogMeta("/recover", t("Восстановить доступ"), t("Новый пароль по\u00a0имени и\u00a0ключу восстановления.")),
    robots: { index: false, follow: true },
  };
}

export default function RecoverPage() {
  return <RecoverForm />;
}
