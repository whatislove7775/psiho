import type { Metadata } from "next";
import { AppShell } from "@/components/shell/AppShell";
import { PortalGate } from "@/components/business/PortalGate";

/** HR portal of a company (B2B): aggregates only. Never indexed. */
export const metadata: Metadata = {
  title: { default: "Кабинет компании", template: "%s | aprosop для компаний" },
  description: "Кабинет HR-администратора компании в aprosop.",
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell role="business">
      <PortalGate>{children}</PortalGate>
    </AppShell>
  );
}
