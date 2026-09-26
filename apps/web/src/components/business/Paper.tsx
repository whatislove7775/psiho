"use client";

import type { ReactNode } from "react";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/ui";
import s from "./business.module.css";

/** Printable document page (invoice / act placeholders). */
export function Paper({ children }: { children: ReactNode }) {
  return (
    <>
      <div className={s.printBar}>
        <Button variant="ghost" href="/business/portal/documents" icon={<ArrowLeft size={18} />}>
          К документам
        </Button>
        <Button variant="secondary" icon={<Printer size={18} />} onClick={() => window.print()}>
          Печать или PDF
        </Button>
      </div>
      <article className={s.paper}>{children}</article>
    </>
  );
}
