import type { Metadata } from "next";
import { RecoverForm } from "@/components/auth/RecoverForm";

export const metadata: Metadata = {
  title: "Восстановить доступ",
  description: "Смена пароля по имени и ключу восстановления.",
  alternates: { canonical: "/recover" },
  robots: { index: false, follow: true },
};

export default function RecoverPage() {
  return <RecoverForm />;
}
