"use client";

import { t, tj } from "@/lib/i18n";
import { lp } from "@/lib/i18n";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SpecialistPhoto } from "@/components/avatar/SpecialistPhoto";
import { PhotoWithFacts } from "@/components/specialists/SpecialistFacts";
import { psychologistsApi } from "@/lib/api/endpoints";
import type { PsychologistPublic } from "@/lib/api/types";
import { rub, experienceLabel } from "@/lib/format";
import { ScrollRow, Skeleton } from "@/ui";
import { useAuth } from "@/lib/auth/store";
import s from "./landing.module.css";

type State = { kind: "loading" } | { kind: "ready"; items: PsychologistPublic[] } | { kind: "hidden" };

/** Specialists: a horizontal scroller of compact cards (a grid row on desktop). */
export function Specialists({ all = false }: { all?: boolean }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const authed = useAuth((st) => st.status === "authed" && st.user?.role === "client");
  // Profiles live in the client cabinet: guests start anonymously first and land right on the profile.
  const hrefFor = (id: string | number) => {
    const profile = `/app/specialists/${id}`;
    return authed ? profile : lp(`/specialists/${id}`);
  };

  useEffect(() => {
    let alive = true;
    psychologistsApi
      .list()
      .then((items) => {
        if (!alive) return;
        const list = Array.isArray(items) ? all ? items : items.slice(0, 8) : [];
        setState(list.length ? { kind: "ready", items: list } : { kind: "hidden" });
      })
      .catch(() => alive && setState({ kind: "hidden" }));
    return () => {
      alive = false;
    };
  }, [all]);

  if (state.kind === "hidden") return all ? <section className={`${s.wrap} ${s.section}`}><h1>{t("Специалисты")}</h1><p>{t("Список специалистов сейчас недоступен. Попробуйте обновить страницу чуть позже.")}</p></section> : null;

  return (
    <section id="specialists" className={`${s.wrap} ${s.section}`} aria-labelledby="specialists-title">
      <div className={s.sectionHead}>
        <div>
          <h2 id="specialists-title" className={s.sectionTitle}>
            {t("Специалисты")}
          </h2>
          <p className={s.sectionSub}>{t("Каждого проверяем вручную. Они видят только ваш аватар и\u00a0псевдоним.")}</p>
        </div>
        <Link href={lp("/match")} className={s.more}>
          {t("Подобрать по\u00a0анкете")}
          <ArrowRight size={16} strokeWidth={2} aria-hidden />
        </Link>
      </div>
      <ScrollRow className={s.bleed} trackClassName={s.scroller} label={t("Специалисты")}>
        {state.kind === "loading"
          ? [0, 1, 2, 3].map((i) => (
              <div key={i} role="listitem" className={s.specCard} aria-hidden>
                <Skeleton width={56} height={56} radius={28} />
                <Skeleton width="70%" height={16} />
                <Skeleton width="50%" height={12} />
              </div>
            ))
          : state.items.map((p) => (
              <div key={p.id} role="listitem">
                <Link href={hrefFor(p.id)} className={`${s.specCard} ${s.specLink}`}>
                  <PhotoWithFacts p={p} photo={<SpecialistPhoto url={p.photo_url} name={p.display_name} size={56} alt="" />} />
                  <span className={s.specName}>{p.display_name}</span>
                  <span className={s.specMeta}>
                    {p.experience_years > 0
                      ? experienceLabel(p.experience_years)
                      : t("Начинающий специалист")}
                    {p.specializations[0] ? ` · ${p.specializations[0].toLowerCase()}` : ""}
                  </span>
                  <span className={s.specRate}>{tj("от\u00a0{rub}", { rub: rub(p.session_rate_rub) })}</span>
                </Link>
              </div>
            ))}
      </ScrollRow>
    </section>
  );
}
