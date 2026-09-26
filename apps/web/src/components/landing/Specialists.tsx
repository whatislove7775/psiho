"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SpecialistPhoto } from "@/components/avatar/SpecialistPhoto";
import { psychologistsApi } from "@/lib/api/endpoints";
import type { PsychologistPublic } from "@/lib/api/types";
import { plural, rub } from "@/lib/format";
import { Skeleton } from "@/ui";
import s from "./landing.module.css";

type State = { kind: "loading" } | { kind: "ready"; items: PsychologistPublic[] } | { kind: "hidden" };

/** Specialists: a horizontal scroller of compact cards (a grid row on desktop). */
export function Specialists() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let alive = true;
    psychologistsApi
      .list()
      .then((items) => {
        if (!alive) return;
        const list = Array.isArray(items) ? items.slice(0, 8) : [];
        setState(list.length ? { kind: "ready", items: list } : { kind: "hidden" });
      })
      .catch(() => alive && setState({ kind: "hidden" }));
    return () => {
      alive = false;
    };
  }, []);

  if (state.kind === "hidden") return null;

  return (
    <section id="specialists" className={`${s.wrap} ${s.section}`} aria-labelledby="specialists-title">
      <div className={s.sectionHead}>
        <div>
          <h2 id="specialists-title" className={s.sectionTitle}>
            Специалисты
          </h2>
          <p className={s.sectionSub}>Каждого проверяем вручную. Они видят только ваш аватар и псевдоним.</p>
        </div>
        <Link href="/match" className={s.more}>
          Подобрать по анкете
          <ArrowRight size={16} strokeWidth={2} aria-hidden />
        </Link>
      </div>
      <ul className={s.scroller} aria-busy={state.kind === "loading"}>
        {state.kind === "loading"
          ? [0, 1, 2, 3].map((i) => (
              <li key={i} className={s.specCard} aria-hidden>
                <Skeleton width={56} height={56} radius={28} />
                <Skeleton width="70%" height={16} />
                <Skeleton width="50%" height={12} />
              </li>
            ))
          : state.items.map((p) => (
              <li key={p.id} className={s.specCard}>
                <SpecialistPhoto url={p.photo_url} name={p.display_name} size={56} alt="" />
                <div className={s.specName}>{p.display_name}</div>
                <div className={s.specMeta}>
                  {p.experience_years > 0
                    ? `Опыт ${p.experience_years} ${plural(p.experience_years, "год", "года", "лет")}`
                    : "Начинающий специалист"}
                  {p.specializations[0] ? ` · ${p.specializations[0].toLowerCase()}` : ""}
                </div>
                <div className={s.specRate}>от {rub(p.session_rate_rub)}</div>
              </li>
            ))}
      </ul>
    </section>
  );
}
