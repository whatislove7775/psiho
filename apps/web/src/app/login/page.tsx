import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/components/auth/LoginForm";

export const metadata: Metadata = {
  title: "Вход",
  description: "Вход в aprosop по имени вроде «тихий-кит-4821» или по почте специалиста.",
  alternates: { canonical: "/login" },
};

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
