"use client";

import { useId, useState } from "react";
import { Plus } from "lucide-react";
import s from "@/components/landing/landing.module.css";
import { BIZ_FAQ } from "./content";

export function BizFaq() {
  const [open, setOpen] = useState<number | null>(0);
  const base = useId();
  return (
    <div className={s.faqList}>
      {BIZ_FAQ.map(([q, a], i) => {
        const isOpen = open === i;
        const btnId = `${base}-q${i}`;
        const panelId = `${base}-a${i}`;
        return (
          <div key={q} className={s.faqItem}>
            <h3 className={s.faqQ}>
              <button id={btnId} type="button" className={s.faqBtn} aria-expanded={isOpen} aria-controls={panelId} onClick={() => setOpen(isOpen ? null : i)}>
                {q}
                <span className={s.faqChevron} aria-hidden>
                  <Plus size={18} strokeWidth={1.8} />
                </span>
              </button>
            </h3>
            <div
              id={panelId}
              role="region"
              aria-labelledby={btnId}
              className={s.faqPanel}
              data-open={isOpen}
              ref={(el) => {
                if (el) el.toggleAttribute("inert", !isOpen);
              }}
            >
              <div>
                <p>{a}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
