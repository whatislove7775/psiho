import type { Metadata } from "next";
import { AppShell } from "@/components/shell/AppShell";

/** Private area: never indexed; link previews use the generic card (opengraph-image.tsx). */
export const metadata: Metadata = {
  title: { default: "Кабинет специалиста", template: "%s | aprosop" },
  description: "Раздел aprosop, который открывается после входа.",
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <AppShell role="psychologist">{children}</AppShell>;
}
