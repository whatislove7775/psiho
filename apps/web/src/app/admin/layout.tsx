import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/AdminShell";

/** Private area: never indexed; link previews use the generic card (opengraph-image.tsx). */
export const metadata: Metadata = {
  title: { default: "Администрирование", template: "%s | aprosop" },
  description: "Раздел aprosop, который открывается после входа.",
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
