"use client";

import { useParams } from "next/navigation";
import { ArrowLeft, Clock, Leaf } from "lucide-react";
import { Button, Card, EmptyState, Skeleton } from "@/ui";
import { WithRail } from "@/components/shell/AppShell";
import { contentApi } from "@/lib/api/content";
import { useLoad } from "@/components/client/useLoad";
import { ErrorBlock } from "@/components/client/ClientBits";
import { SupportCard } from "@/components/client/NextSessionCard";
import { PracticeCard } from "@/components/content/Cards";
import { BreathingCircle, StepPlayer } from "@/components/content/PracticePlayer";
import c from "@/components/content/content.module.css";
import s from "../../articles/articles.module.css";

export default function PracticePage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";
  const practice = useLoad(() => contentApi.practice(slug), [slug]);
  const more = useLoad(() => contentApi.practices(), []);

  const back = (
    <Button variant="ghost" size="sm" href="/app/practices" icon={<ArrowLeft size={18} strokeWidth={1.8} />} className={s.back}>
      Все практики
    </Button>
  );

  if (practice.error) {
    return (
      <>
        {back}
        {/не найден|not found|No .* matches/i.test(practice.error) ? (
          <EmptyState
            icon={<Leaf size={28} strokeWidth={1.8} />}
            title="Практика не найдена"
            text="Возможно, её убрали или ссылка неполная."
            action={<Button href="/app/practices">Все практики</Button>}
          />
        ) : (
          <ErrorBlock message={practice.error} onRetry={practice.reload} />
        )}
      </>
    );
  }

  const p = practice.data;
  const others = (more.data ?? []).filter((x) => x.slug !== slug).slice(0, 4);

  return (
    <>
      {back}
      <WithRail
        rail={
          <>
            {others.length > 0 && (
              <section className={s.related} aria-label="Другие практики">
                <div className={s.railTitle}>Другие практики</div>
                {others.map((o) => (
                  <PracticeCard key={o.id} p={o} />
                ))}
              </section>
            )}
            <SupportCard />
          </>
        }
      >
        <Card as="article" className={s.article}>
          {!p ? (
            <div className={s.head} aria-busy>
              <Skeleton width="30%" height={14} />
              <Skeleton width="70%" height={40} />
              <Skeleton width="100%" height={220} radius={22} />
            </div>
          ) : (
            <>
              <header className={s.head}>
                <div className={s.kicker}>
                  <span className={c.tone} data-tone={p.cover} style={{ width: 36, height: 36, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 18 }} aria-hidden>
                    {p.emoji || "🌿"}
                  </span>
                  <span>{p.kind_label}</span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <Clock size={14} strokeWidth={1.8} aria-hidden />
                    {p.duration_minutes} мин
                  </span>
                </div>
                <h1 className={s.title}>{p.title}</h1>
                {p.summary && <p className={s.lead}>{p.summary}</p>}
              </header>
              {p.pattern ? (
                <>
                  <BreathingCircle pattern={p.pattern} tone={p.cover} />
                  {p.steps.length > 0 && (
                    <details className={s.howto}>
                      <summary>Как выполнять</summary>
                      <ol>
                        {p.steps.map((st, i) => (
                          <li key={i}>
                            <strong>{st.title}</strong> {st.text}
                          </li>
                        ))}
                      </ol>
                    </details>
                  )}
                </>
              ) : (
                <StepPlayer practice={p} />
              )}
              <p className={s.foot}>
                Если во время практики становится хуже, остановитесь и вернитесь к обычному дыханию. Практики помогают
                справляться с напряжением, но не заменяют помощь специалиста.
              </p>
            </>
          )}
        </Card>
      </WithRail>
    </>
  );
}
