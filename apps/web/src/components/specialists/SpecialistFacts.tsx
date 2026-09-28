import type { ReactNode } from "react";
import { specialistFacts } from "@/lib/specialistFacts";
import s from "./facts.module.css";

/** Photo with a quiet side column: «32 года» / «На Aprosop 3 мес.» (each only if known). */
export function PhotoWithFacts({
  photo,
  p,
  className,
}: {
  photo: ReactNode;
  p: { age?: number | null; on_service_since?: string | null };
  className?: string;
}) {
  const facts = specialistFacts(p);
  if (!facts.length) return <>{photo}</>;
  return (
    <span className={`${s.row} ${className ?? ""}`}>
      {photo}
      <span className={s.facts}>
        {facts.map((f) => (
          <span key={f}>{f}</span>
        ))}
      </span>
    </span>
  );
}

/** Inline variant: «32 года · На Aprosop 3 мес.» */
export function FactsLine({ p, className }: { p: { age?: number | null; on_service_since?: string | null }; className?: string }) {
  const facts = specialistFacts(p);
  if (!facts.length) return null;
  return <span className={`${s.line} ${className ?? ""}`}>{facts.join(" · ")}</span>;
}
