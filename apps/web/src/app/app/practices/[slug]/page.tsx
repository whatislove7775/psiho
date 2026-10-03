"use client";

import { t } from "@/lib/i18n";
import { useParams } from "next/navigation";
import { ArrowLeft, Clock, Leaf } from "lucide-react";
import { Button, Card, EmptyState, Skeleton } from "@/ui";
import { WithRail } from "@/components/shell/AppShell";
import { contentApi } from "@/lib/api/content";
import { useLoad } from "@/components/client/useLoad";
import { ErrorBlock } from "@/components/client/ClientBits";
import { PracticeCard } from "@/components/content/Cards";
import { BreathingCircle, StepPlayer } from "@/components/content/PracticePlayer";
import { Cautions, EvidenceBadge, Mechanism, Sources } from "@/components/content/Evidence";
import c from "@/components/content/content.module.css";
import s from "../../articles/articles.module.css";
import { EmptyArt } from "@/components/illustrations";
import { TopicArt } from "@/components/illustrations/topics";
import art from "@/components/content/art.module.css";
import { typo } from "@/lib/typography";

export default function PracticePage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";
  const practice = useLoad(() => contentApi.practice(slug), [slug]);
  const more = useLoad(() => contentApi.practices(), []);

  const back = (
    <Button variant="ghost" size="sm" href="/app/practices" icon={<ArrowLeft size={18} strokeWidth={1.8} />} className={s.back}>
      {t("Все практики")}
    </Button>
  );

  if (practice.error) {
    return (
      <>
        {back}
        {/не найден|not found|No .* matches/i.test(practice.error) ? (
          <EmptyState art={<EmptyArt scene="lost" />}
            icon={<Leaf size={28} strokeWidth={1.8} />}
            title={t("Практика не\u00a0найдена")}
            text={t("Возможно, её\u00a0убрали или\u00a0ссылка неполная.")}
            action={<Button href="/app/practices">{t("Все практики")}</Button>}
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
              <section className={s.related} aria-label={t("Другие практики")}>
                <div className={s.railTitle}>{t("Другие практики")}</div>
                {others.map((o) => (
                  <PracticeCard key={o.id} p={o} />
                ))}
              </section>
            )}
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
                    <TopicArt topic={p.kind} className={art.kickerArt} />
                  </span>
                  <span>{p.kind_label}</span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <Clock size={14} strokeWidth={1.8} aria-hidden />
                    {p.duration_minutes}{" "}{t("мин")}
                  </span>
                  <EvidenceBadge level={p.evidence_level} />
                </div>
                <h1 className={s.title}>{typo(p.title)}</h1>
                {p.summary && <p className={s.lead}>{typo(p.summary)}</p>}
              </header>
              {p.pattern ? (
                <>
                  <BreathingCircle pattern={p.pattern} tone={p.cover} />
                  {p.steps.length > 0 && (
                    <details className={s.howto}>
                      <summary>{t("Как\u00a0выполнять")}</summary>
                      <ol>
                        {p.steps.map((st, i) => (
                          <li key={i}>
                            <strong>{typo(st.title)}</strong> {typo(st.text)}
                          </li>
                        ))}
                      </ol>
                    </details>
                  )}
                </>
              ) : (
                <StepPlayer practice={p} />
              )}
              <Mechanism text={p.mechanism} />
              <Cautions text={p.cautions} />
              <Sources sources={p.sources} level={p.evidence_level} reviewedAt={p.reviewed_at} />
            </>
          )}
        </Card>
      </WithRail>
    </>
  );
}
