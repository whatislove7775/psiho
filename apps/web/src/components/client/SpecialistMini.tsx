"use client";

import Link from "next/link";
import { CalendarClock } from "lucide-react";
import type { PsychologistPublic } from "@/lib/api/types";
import { useState } from "react";
import { SpecialistPhoto } from "@/components/avatar/SpecialistPhoto";
import { Skeleton } from "@/ui";
import { dayLabel, rub, time } from "@/lib/format";
import s from "./specialistMini.module.css";

/** Compact specialist card for carousels: real photo if uploaded, else initials. */
export function SpecialistMini({ p }: { p: PsychologistPublic }) {
  const [broken, setBroken] = useState(false);
  return (
    <Link href={`/app/specialists/${p.id}`} className={s.card}>
      <span className={s.photo}>
        {p.photo_url && !broken ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.photo_url} alt="" loading="lazy" onError={() => setBroken(true)} />
        ) : (
          <SpecialistPhoto url={null} name={p.display_name} size={84} />
        )}
      </span>
      <span className={s.body}>
        <span className={s.name}>{p.display_name}</span>
        <span className={s.tags}>{p.specializations.slice(0, 2).join(", ") || p.approach || "Психолог"}</span>
        <span className={s.foot}>
          <span className={s.rate}>{rub(p.session_rate_rub)}</span>
          {p.next_slot && (
            <span className={s.slot}>
              <CalendarClock size={14} strokeWidth={1.8} aria-hidden />
              {dayLabel(p.next_slot)}, {time(p.next_slot)}
            </span>
          )}
        </span>
      </span>
    </Link>
  );
}

export function SpecialistMiniSkeleton() {
  return (
    <div className={s.card} aria-hidden>
      <Skeleton height={150} radius={16} />
      <span className={s.body}>
        <Skeleton width="70%" height={16} />
        <Skeleton width="90%" height={12} />
        <Skeleton width="50%" height={12} />
      </span>
    </div>
  );
}
