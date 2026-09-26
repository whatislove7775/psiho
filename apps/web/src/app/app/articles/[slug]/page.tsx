"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, BookOpen, Clock } from "lucide-react";
import { Button, Card, EmptyState, Skeleton } from "@/ui";
import { WithRail } from "@/components/shell/AppShell";
import { contentApi } from "@/lib/api/content";
import { useLoad } from "@/components/client/useLoad";
import { ErrorBlock } from "@/components/client/ClientBits";
import { ArticleCard } from "@/components/content/Cards";
import { Markdown } from "@/components/content/Markdown";
import { EvidenceBadge, KeyFacts, SeekHelp, Sources } from "@/components/content/Evidence";
import c from "@/components/content/content.module.css";
import s from "../articles.module.css";
import { EmptyArt } from "@/components/illustrations";
import { TopicArt } from "@/components/illustrations/topics";
import art from "@/components/content/art.module.css";
import { SearchTrigger } from "@/components/search/SpecialistSearch";

export default function ArticlePage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";
  const article = useLoad(() => contentApi.article(slug), [slug]);
  const topic = article.data?.topic;
  const related = useLoad(
    () => (topic ? contentApi.articles({ topic, exclude: slug, limit: 3 }) : Promise.resolve([])),
    [topic, slug],
  );

  const back = (
    <Button variant="ghost" size="sm" href="/app/articles" icon={<ArrowLeft size={18} strokeWidth={1.8} />} className={s.back}>
      Все статьи
    </Button>
  );

  if (article.error) {
    return (
      <>
        {back}
        {/не найден|not found|No .* matches/i.test(article.error) ? (
          <EmptyState art={<EmptyArt scene="lost" />}
            icon={<BookOpen size={28} strokeWidth={1.8} />}
            title="Статья не найдена"
            text="Возможно, её убрали или ссылка неполная."
            action={<Button href="/app/articles">Все статьи</Button>}
          />
        ) : (
          <ErrorBlock message={article.error} onRetry={article.reload} />
        )}
      </>
    );
  }

  const a = article.data;

  return (
    <>
      {back}
      <WithRail
        rail={
          <>
            <SearchTrigger variant="soft" block>
              Обсудить со специалистом
            </SearchTrigger>
            {related.data && related.data.length > 0 && (
              <section className={s.related} aria-label="Ещё по теме">
                <div className={s.railTitle}>Ещё по теме</div>
                {related.data.map((r) => (
                  <ArticleCard key={r.id} a={r} compact />
                ))}
              </section>
            )}
          </>
        }
      >
        <Card as="article" className={s.article}>
          {!a ? (
            <div className={s.head} aria-busy>
              <Skeleton height={180} radius={22} />
              <Skeleton width="30%" height={14} />
              <Skeleton width="80%" height={40} />
              <Skeleton width="100%" height={16} />
              <Skeleton width="90%" height={16} />
              <Skeleton width="95%" height={16} />
            </div>
          ) : (
            <>
              <header className={s.head}>
                <div className={`${s.banner} ${c.tone}`} data-tone={a.cover} aria-hidden>
                  <TopicArt topic={a.topic} className={art.bannerArt} />
                </div>
                <div className={s.kicker}>
                  <Link href={`/app/articles?topic=${a.topic}`}>{a.topic_label}</Link>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <Clock size={14} strokeWidth={1.8} aria-hidden />
                    {a.reading_minutes} мин чтения
                  </span>
                  <EvidenceBadge level={a.evidence_level} />
                </div>
                <h1 className={s.title}>{a.title}</h1>
                {a.summary && <p className={s.lead}>{a.summary}</p>}
              </header>
              <KeyFacts facts={a.key_facts} />
              <Markdown source={a.body} />
              <SeekHelp text={a.when_to_seek_help} />
              <Sources sources={a.sources} level={a.evidence_level} reviewedAt={a.reviewed_at} />
              {a.author_name && <p className={s.foot}>{a.author_name}</p>}
            </>
          )}
        </Card>
      </WithRail>
    </>
  );
}
