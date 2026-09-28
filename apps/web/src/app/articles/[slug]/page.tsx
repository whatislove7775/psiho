import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Clock } from "lucide-react";
import { ArticleByline, ArticleCard, PracticeCard } from "@/components/content/Cards";
import { ArticleBanner } from "@/components/content/ArticleBanner";
import { AuthorCard, ReadCounter } from "@/components/content/AuthorCard";
import { EvidenceBadge, KeyFacts, SeekHelp, Sources } from "@/components/content/Evidence";
import { RichText, countWords } from "@/components/content/RichText";
import { ArticleRating, RatingBadge } from "@/components/content/ArticleRating";
import { Breadcrumbs } from "@/components/public/Breadcrumbs";
import { JsonLd } from "@/components/public/JsonLd";
import { PublicShell } from "@/components/public/PublicShell";
import { StartCta } from "@/components/public/StartCta";
import { isSlug, serverContent } from "@/lib/content/server";
import type { Article } from "@/lib/api/content";
import { abs, alternates, ORG_ID, WEBSITE_ID } from "@/lib/seo";
import { Button } from "@/ui";
import s from "@/components/public/public.module.css";
import { typo } from "@/lib/typography";

// Rendered on first request, then served from cache and refreshed every 5 minutes (ISR).
export const revalidate = 300;
export const dynamicParams = true;

type Props = { params: { slug: string } };

async function load(slug: string): Promise<Article | null> {
  return isSlug(slug) ? serverContent.article(slug) : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const a = await load(params.slug);
  if (!a) return { title: "Статья не\u00a0найдена", robots: { index: false } };
  const path = `/articles/${a.slug}`;
  return {
    title: a.title,
    description: a.summary,
    alternates: alternates(path),
    openGraph: {
      type: "article",
      url: path,
      title: a.title,
      description: a.summary,
      publishedTime: a.published_at ?? undefined,
      modifiedTime: a.updated_at ?? undefined,
      section: a.topic_label,
      tags: [...(a.topic_labels ?? []), ...a.tags],
    },
  };
}

/** Which practice kinds fit an article topic best (for «Попробовать сейчас»). */
const PRACTICE_FOR_TOPIC: Record<string, string[]> = {
  anxiety: ["breathing", "grounding"],
  stress: ["body", "breathing"],
  sleep: ["body", "journaling"],
  mood: ["mindfulness", "journaling"],
  self: ["journaling", "mindfulness"],
  loss: ["journaling", "body"],
  relationships: ["journaling", "breathing"],
  therapy: ["journaling", "breathing"],
};

function rank(kinds: string[], kind: string) {
  const i = kinds.indexOf(kind);
  return i === -1 ? kinds.length : i;
}

export default async function ArticlePage({ params }: Props) {
  const a = await load(params.slug);
  if (!a) notFound();

  const topics = a.topics?.length ? a.topics : [a.topic];
  const labels = a.topic_labels?.length ? a.topic_labels : [a.topic_label];
  const [sameTopic, practices] = await Promise.all([serverContent.articles({ topic: topics.join(",") }), serverContent.practices()]);
  const related = sameTopic.filter((r) => r.slug !== a.slug).slice(0, 3);
  const kinds = PRACTICE_FOR_TOPIC[a.topic] ?? [];
  const suggested = [...practices].sort((x, y) => rank(kinds, x.kind) - rank(kinds, y.kind)).slice(0, 2);
  const path = `/articles/${a.slug}`;
  const sources = a.sources ?? [];

  const articleLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    "@id": `${abs(path)}#article`,
    headline: a.title,
    description: a.summary,
    inLanguage: "ru-RU",
    url: abs(path),
    mainEntityOfPage: { "@id": abs(path) },
    datePublished: a.published_at ?? undefined,
    dateModified: a.updated_at ?? a.published_at ?? undefined,
    author: a.specialist
      ? { "@type": "Person", name: a.specialist.name, ...(a.specialist.photo_url ? { image: abs(a.specialist.photo_url) } : {}) }
      : { "@type": "Organization", name: a.author_name || "Редакция Aprosop", url: abs("/") },
    ...(a.cover_image ? { image: abs(a.cover_image.url) } : {}),
    ...(a.rating?.count && a.rating.avg != null
      ? { aggregateRating: { "@type": "AggregateRating", ratingValue: a.rating.avg, ratingCount: a.rating.count, bestRating: 5, worstRating: 1 } }
      : {}),
    publisher: { "@id": ORG_ID },
    isPartOf: { "@id": WEBSITE_ID },
    articleSection: a.topic_label,
    keywords: [...labels, ...a.tags].join(", "),
    wordCount: countWords(a.content),
    timeRequired: `PT${a.reading_minutes}M`,
    citation: sources.map((src) => ({
      "@type": "CreativeWork",
      name: src.title,
      url: src.url,
      ...(src.authors ? { author: src.authors } : {}),
      ...(src.year ? { datePublished: String(src.year) } : {}),
      ...(src.publisher ? { publisher: src.publisher } : {}),
      ...(src.doi ? { sameAs: `https://doi.org/${src.doi}` } : {}),
    })),
  };
  const pageLd = {
    "@context": "https://schema.org",
    "@type": "MedicalWebPage",
    "@id": abs(path),
    url: abs(path),
    name: a.title,
    inLanguage: "ru-RU",
    isPartOf: { "@id": WEBSITE_ID },
    mainEntity: { "@id": `${abs(path)}#article` },
    audience: { "@type": "PeopleAudience", audienceType: "Patient" },
    about: labels.map((name) => ({ "@type": "Thing", name })),
    ...(a.reviewed_at ? { lastReviewed: a.reviewed_at, reviewedBy: { "@id": ORG_ID } } : {}),
  };

  return (
    <PublicShell>
      <Breadcrumbs
        items={[
          { name: "Главная", href: "/" },
          { name: "Статьи", href: "/articles" },
          { name: a.title, href: path },
        ]}
      />
      <JsonLd data={articleLd} />
      <JsonLd data={pageLd} />

      <div className={s.detail}>
        <article className={s.doc}>
          <header className={s.head}>
            <ArticleBanner a={a} className={s.banner} />
            <div className={s.meta}>
              {topics.map((t, i) => (
                <Link key={t} href={`/articles?topic=${t}`}>
                  {labels[i] ?? t}
                </Link>
              ))}
              <span>
                <Clock size={14} strokeWidth={1.8} aria-hidden />
                {a.reading_minutes} мин чтения
              </span>
              <EvidenceBadge level={a.evidence_level} />
              <RatingBadge rating={a.rating} />
            </div>
            <h1 className={s.title}>{typo(a.title)}</h1>
            {a.summary && <p className={s.lead}>{typo(a.summary)}</p>}
          </header>

          <KeyFacts facts={a.key_facts} />
          <RichText html={a.content} />
          <SeekHelp
            text={a.when_to_seek_help}
            cta={
              <Button href="/start" variant="primary" size="sm">
                Поговорить с&nbsp;психологом анонимно
              </Button>
            }
          />
          <Sources sources={sources} level={a.evidence_level} reviewedAt={a.reviewed_at} />
          <ArticleRating slug={a.slug} initial={a.rating} loginNext={path} />
          <ArticleByline a={a} />
          {a.specialist && <AuthorCard specialist={a.specialist} />}
          <ReadCounter slug={a.slug} />
        </article>

        <aside className={s.aside} aria-label="Ещё по&nbsp;теме">
          <StartCta compact />
          {related.length > 0 && (
            <section>
              <h2 className={s.asideTitle}>Ещё по&nbsp;теме</h2>
              <ul className={s.asideList}>
                {related.map((r) => (
                  <li key={r.id}>
                    <ArticleCard a={r} base="" compact />
                  </li>
                ))}
              </ul>
            </section>
          )}
          {practices.length > 0 && (
            <section>
              <h2 className={s.asideTitle}>Попробовать сейчас</h2>
              <ul className={s.asideList}>
                {suggested.map((p) => (
                  <li key={p.id}>
                    <PracticeCard p={p} base="" />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </PublicShell>
  );
}
