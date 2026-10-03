import { t as tt, msg } from "@/lib/i18n";
import { lp } from "@/lib/i18n";
import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { ArticleCard } from "@/components/content/Cards";
import { Breadcrumbs } from "@/components/public/Breadcrumbs";
import { JsonLd } from "@/components/public/JsonLd";
import { PublicShell } from "@/components/public/PublicShell";
import { StartCta } from "@/components/public/StartCta";
import { serverContent } from "@/lib/content/server";
import { abs, alternates, ORG_ID, WEBSITE_ID, inLanguage } from "@/lib/seo";
import s from "@/components/public/public.module.css";
import { ogMeta } from "@/lib/og/sections";

// Rendered per request (topic filter and search), data comes from the 5-minute content cache.
export const dynamic = "force-dynamic";

type Props = { searchParams: { topic?: string; q?: string; from?: string } };

const TITLE = msg("Статьи о\u00a0психологии: тревога, выгорание, сон, отношения");
const DESCRIPTION =
  msg("Понятные статьи о\u00a0психическом здоровье с\u00a0проверенными источниками: тревога и\u00a0паника, выгорание, сон, отношения, горе, самооценка и\u00a0как\u00a0устроена психотерапия.");

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const filtered = Boolean(searchParams.topic || searchParams.q || searchParams.from);
  return {
    title: tt(TITLE),
    description: tt(DESCRIPTION),
    alternates: alternates("/articles"),
    ...ogMeta("/articles", tt("Статьи о\u00a0психике"), tt(DESCRIPTION)),
    // Filtered and search views are thin duplicates of the main list
    robots: filtered ? { index: false, follow: true } : undefined,
  };
}

export default async function ArticlesPage({ searchParams }: Props) {
  const topic = typeof searchParams.topic === "string" ? searchParams.topic.slice(0, 32) : "";
  const q = typeof searchParams.q === "string" ? searchParams.q.trim().slice(0, 100) : "";
  const fromPros = searchParams.from === "specialists";
  const [all, topics] = await Promise.all([serverContent.articles(), serverContent.topics()]);
  const words = q.toLocaleLowerCase("ru").split(/\s+/).filter(Boolean);
  const articles = all.filter(
    (a) =>
      (!topic || (a.topics?.length ? a.topics : [a.topic]).includes(topic)) &&
      (!fromPros || Boolean(a.specialist)) &&
      (!words.length ||
        words.every((w) => `${a.title} ${a.summary} ${a.tags.join(" ")}`.toLocaleLowerCase("ru").includes(w))),
  );
  const topicLabel = topics.find((t) => t.value === topic)?.label;
  const prosCount = all.filter((a) => a.specialist).length;

  return (
    <PublicShell>
      <Breadcrumbs
        items={[
          { name: tt("Главная"), href: "/" },
          { name: tt("Статьи"), href: "/articles" },
        ]}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          "@id": abs("/articles"),
          url: abs("/articles"),
          name: tt(TITLE),
          description: tt(DESCRIPTION),
          inLanguage: inLanguage(),
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
          <h1>{tt("Статьи")}</h1>
          <p>
            {tt("Спокойно и\u00a0по\u00a0делу, с\u00a0источниками.")}{" "}<Link href={lp("/practices")}>{tt("Практики")}</Link>{" "}{tt("— отдельно.")}
          </p>
        </div>
        <form action="/articles" method="get" role="search" className={s.search}>
          <Search size={18} strokeWidth={1.9} aria-hidden />
          <label htmlFor="articles-q" className="visually-hidden">
            {tt("Поиск по\u00a0статьям")}
          </label>
          <input id="articles-q" name="q" type="search" defaultValue={q} placeholder={tt("Поиск по\u00a0статьям")} autoComplete="off" />
          {topic && <input type="hidden" name="topic" value={topic} />}
          <button type="submit">{tt("Найти")}</button>
        </form>
      </header>

      {topics.length > 0 && (
        <nav aria-label={tt("Темы статей")}>
          <ul className={s.topics}>
            <li>
              <Link href={lp("/articles")} className={s.topic} aria-current={!topic && !fromPros ? "page" : undefined}>
                {tt("Все темы")}
              </Link>
            </li>
            {prosCount > 0 && (
              <li>
                <Link href={lp("/articles?from=specialists")} className={s.topic} aria-current={fromPros ? "page" : undefined}>
                  {tt("От\u00a0специалистов")}
                  <span>{prosCount}</span>
                </Link>
              </li>
            )}
            {topics.map((t) => (
              <li key={t.value}>
                <Link href={lp(`/articles?topic=${t.value}`)} className={s.topic} aria-current={topic === t.value && !fromPros ? "page" : undefined}>
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
          {q ? tt(`Результаты поиска «{q}»`, { q }) : tt(`Тема: {topicLabel}`, { topicLabel })}
        </h2>
      )}
      {articles.length === 0 ? (
        <p className={s.empty}>
          {q ? tt(`По\u00a0запросу «{q}» ничего не\u00a0нашлось. `, { q }) : tt("Статей на\u00a0эту тему пока нет. ")}
          <Link href={lp("/articles")}>{tt("Все статьи")}</Link>
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

      <StartCta />
    </PublicShell>
  );
}
