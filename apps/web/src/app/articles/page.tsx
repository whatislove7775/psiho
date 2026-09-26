import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { ArticleCard, PracticeCard } from "@/components/content/Cards";
import { Breadcrumbs } from "@/components/public/Breadcrumbs";
import { JsonLd } from "@/components/public/JsonLd";
import { PublicShell } from "@/components/public/PublicShell";
import { StartCta } from "@/components/public/StartCta";
import { serverContent } from "@/lib/content/server";
import { abs, alternates, ORG_ID, WEBSITE_ID } from "@/lib/seo";
import s from "@/components/public/public.module.css";
import { ogMeta } from "@/lib/og/sections";

// Rendered per request (topic filter and search), data comes from the 5-minute content cache.
export const dynamic = "force-dynamic";

type Props = { searchParams: { topic?: string; q?: string } };

const TITLE = "Статьи о психологии: тревога, выгорание, сон, отношения";
const DESCRIPTION =
  "Понятные статьи о психическом здоровье с проверенными источниками: тревога и паника, выгорание, сон, отношения, горе, самооценка и как устроена психотерапия.";

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const filtered = Boolean(searchParams.topic || searchParams.q);
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: alternates("/articles"),
    ...ogMeta("/articles", "Статьи о психике", DESCRIPTION),
    // Filtered and search views are thin duplicates of the main list
    robots: filtered ? { index: false, follow: true } : undefined,
  };
}

export default async function ArticlesPage({ searchParams }: Props) {
  const topic = typeof searchParams.topic === "string" ? searchParams.topic.slice(0, 32) : "";
  const q = typeof searchParams.q === "string" ? searchParams.q.trim().slice(0, 100) : "";
  const [all, topics, practices] = await Promise.all([
    serverContent.articles(),
    serverContent.topics(),
    serverContent.practices(),
  ]);
  const words = q.toLocaleLowerCase("ru").split(/\s+/).filter(Boolean);
  const articles = all.filter(
    (a) =>
      (!topic || a.topic === topic) &&
      (!words.length ||
        words.every((w) => `${a.title} ${a.summary} ${a.tags.join(" ")}`.toLocaleLowerCase("ru").includes(w))),
  );
  const topicLabel = topics.find((t) => t.value === topic)?.label;

  return (
    <PublicShell>
      <Breadcrumbs
        items={[
          { name: "Главная", href: "/" },
          { name: "Статьи", href: "/articles" },
        ]}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          "@id": abs("/articles"),
          url: abs("/articles"),
          name: TITLE,
          description: DESCRIPTION,
          inLanguage: "ru-RU",
          isPartOf: { "@id": WEBSITE_ID },
          publisher: { "@id": ORG_ID },
          mainEntity: {
            "@type": "ItemList",
            itemListElement: all.map((a, i) => ({ "@type": "ListItem", position: i + 1, url: abs(`/articles/${a.slug}`), name: a.title })),
          },
        }}
      />

      <header className={s.intro}>
        <div>
          <h1>Статьи</h1>
          <p>
            Спокойно и по делу: о тревоге, выгорании, сне, отношениях и о том, как устроена терапия. У каждой статьи есть
            проверенные источники и пометка о силе доказательств.
          </p>
        </div>
        <form action="/articles" method="get" role="search" className={s.search}>
          <Search size={18} strokeWidth={1.9} aria-hidden />
          <label htmlFor="articles-q" className="visually-hidden">
            Поиск по статьям
          </label>
          <input id="articles-q" name="q" type="search" defaultValue={q} placeholder="Поиск по статьям" autoComplete="off" />
          {topic && <input type="hidden" name="topic" value={topic} />}
          <button type="submit">Найти</button>
        </form>
      </header>

      {topics.length > 0 && (
        <nav aria-label="Темы статей">
          <ul className={s.topics}>
            <li>
              <Link href="/articles" className={s.topic} aria-current={!topic ? "page" : undefined}>
                Все темы
              </Link>
            </li>
            {topics.map((t) => (
              <li key={t.value}>
                <Link href={`/articles?topic=${t.value}`} className={s.topic} aria-current={topic === t.value ? "page" : undefined}>
                  {t.label}
                  <span>{t.count}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {(q || topicLabel) && (
        <h2 className="visually-hidden">
          {q ? `Результаты поиска «${q}»` : `Тема: ${topicLabel}`}
        </h2>
      )}
      {articles.length === 0 ? (
        <p className={s.empty}>
          {q ? `По запросу «${q}» ничего не нашлось. ` : "Статей на эту тему пока нет. "}
          <Link href="/articles">Все статьи</Link>
        </p>
      ) : (
        <ul className={s.grid}>
          {articles.map((a) => (
            <li key={a.id}>
              <ArticleCard a={a} base="" />
            </li>
          ))}
        </ul>
      )}

      {practices.length > 0 && !q && (
        <section aria-labelledby="practices-title">
          <div className={s.sectionHead}>
            <h2 id="practices-title">Практики на каждый день</h2>
            <Link href="/practices">Все практики</Link>
          </div>
          <ul className={s.practiceGrid}>
            {practices.slice(0, 4).map((p) => (
              <li key={p.id}>
                <PracticeCard p={p} base="" />
              </li>
            ))}
          </ul>
        </section>
      )}

      <StartCta />
    </PublicShell>
  );
}
