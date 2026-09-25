"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { SpecialistPhoto } from "@/components/avatar/SpecialistPhoto";
import { psychologistsApi } from "@/lib/api/endpoints";
import type { PsychologistPublic } from "@/lib/api/types";
import { plural, rub } from "@/lib/format";
import { topicTone } from "@/lib/topicTone";
import { Badge, Button, Skeleton } from "@/ui";
import { SpecialistFriend } from "@/components/illustrations";
import a from "./art.module.css";
import s from "./landing.module.css";

type State = { kind: "loading" } | { kind: "ready"; items: PsychologistPublic[] } | { kind: "hidden" };

export function Specialists() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let alive = true;
    psychologistsApi
      .list()
      .then((items) => {
        if (!alive) return;
        const list = Array.isArray(items) ? items.slice(0, 4) : [];
        setState(list.length ? { kind: "ready", items: list } : { kind: "hidden" });
      })
      .catch(() => alive && setState({ kind: "hidden" }));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <section id="specialists" className={`${s.wrap} ${s.section}`} aria-labelledby="specialists-title">
      <div className={`${s.specs} ${state.kind === "hidden" ? s.specsSolo : ""}`}>
        <div className={s.verifyCard}>
          <h2 id="specialists-title">Каждого специалиста проверяем вручную</h2>
          <p>
            Профиль попадает в каталог только после того, как мы сами посмотрим образование и опыт. Специалист видит ваш
            аватар и имя вроде «тихий-кит-4821», и больше ничего.
          </p>
          <ul className={s.verifyList}>
            <li>
              <Check size={18} strokeWidth={2} aria-hidden />
              Образование и опыт работы
            </li>
            <li>
              <Check size={18} strokeWidth={2} aria-hidden />
              Подход и темы, с которыми работает
            </li>
            <li>
              <Check size={18} strokeWidth={2} aria-hidden />
              Цена созвона известна заранее
            </li>
          </ul>
          <SpecialistFriend className={a.verifyArt} />
          <Button href="/join" variant="white" className={s.verifyAction}>
            Подать анкету специалиста
          </Button>
        </div>

        {state.kind !== "hidden" && (
          <div className={s.specList}>
            <div className={s.specListHead}>
              <h3>Сейчас принимают</h3>
              <span>цена самого короткого созвона</span>
            </div>
            {state.kind === "loading"
              ? [0, 1, 2].map((i) => (
                  <div key={i} className={s.specRow} aria-hidden>
                    <Skeleton width={64} height={64} radius={32} />
                    <div style={{ display: "grid", gap: 8 }}>
                      <Skeleton width="50%" height={18} />
                      <Skeleton width="70%" height={14} />
                    </div>
                  </div>
                ))
              : state.items.map((p) => (
                  <article key={p.id} className={s.specRow}>
                    <SpecialistPhoto url={p.photo_url} name={p.display_name} size={64} alt="" />
                    <div>
                      <div className={s.specName}>{p.display_name}</div>
                      <div className={s.specMeta}>
                        {p.experience_years > 0
                          ? `Опыт ${p.experience_years} ${plural(p.experience_years, "год", "года", "лет")}`
                          : "Начинающий специалист"}
                      </div>
                      {p.specializations.length > 0 && (
                        <div className={s.specTags}>
                          {p.specializations.slice(0, 3).map((t) => (
                            <Badge key={t} tone={topicTone(t)}>
                              {t}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className={s.specRate}>
                      {rub(p.session_rate_rub)}
                      <small>за созвон</small>
                    </div>
                  </article>
                ))}
          </div>
        )}
      </div>
    </section>
  );
}
