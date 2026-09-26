import type { ReactNode } from "react";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { SiteHeader } from "@/components/landing/SiteHeader";
import l from "@/components/landing/landing.module.css";
import s from "./public.module.css";

/** Frame for public (no login) pages: site header, centred content column, footer. */
export function PublicShell({ children, narrow }: { children: ReactNode; narrow?: boolean }) {
  return (
    <div className={l.page}>
      <SiteHeader />
      <main id="main" className={`${l.wrap} ${s.main}`} data-narrow={narrow || undefined}>
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
