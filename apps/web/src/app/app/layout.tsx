import type { Metadata } from "next";
import { AppShell } from "@/components/shell/AppShell";
import { SpecialistSearchProvider } from "@/components/search/SpecialistSearch";

/** Private area: never indexed; link previews use the generic card (opengraph-image.tsx). */
export const metadata: Metadata = {
  title: { default: "Кабинет", template: "%s | aprosop" },
  description: "Раздел aprosop, который открывается после входа.",
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  // Specialist search palette («Найти специалиста», ⌘K / Ctrl+K) lives across the whole client cabinet
  return (
    <SpecialistSearchProvider>
      <AppShell role="client">{children}</AppShell>
    </SpecialistSearchProvider>
  );
}
