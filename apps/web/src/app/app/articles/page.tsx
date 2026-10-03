"use client";

import { t as tt } from "@/lib/i18n";
import { Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BookOpen } from "lucide-react";
import { EmptyState } from "@/ui";
import { PageHeader } from "@/components/shell/AppShell";
import { contentApi } from "@/lib/api/content";
import { useLoad } from "@/components/client/useLoad";
import { ErrorBlock } from "@/components/client/ClientBits";
import { ArticleCard, ArticleCardSkeleton } from "@/components/content/Cards";
import c from "@/components/content/content.module.css";
import s from "./articles.module.css";
import { UsefulTabs } from "@/components/content/UsefulTabs";
import { EmptyArt } from "@/components/illustrations";

function Articles() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname() ?? "/app/articles";
  const fromPros = params?.get("from") === "specialists";
  const topic = fromPros ? "" : params?.get("topic") ?? "";
  const topics = useLoad(() => contentApi.topics());
  const pros = useLoad(() => contentApi.articles({ source: "specialists", sort: "top" }));
  const articles = useLoad(
    () => (fromPros ? contentApi.articles({ source: "specialists", sort: "top" }) : contentApi.articles({ topic: topic || undefined })),
    [topic, fromPros],
  );

  const pick = (t: string) => router.replace(t ? `${pathname}?${t === "specialists" ? "from" : "topic"}=${t}` : pathname, { scroll: false });

  return (
    <>
      <PageHeader title={tt("Полезное")} />
      <UsefulTabs />

      <div className={s.chips} role="group" aria-label={tt("Темы статей")}>
        <button type="button" className={s.chip} aria-pressed={!topic && !fromPros} onClick={() => pick("")}>
          {tt("Все")}
        </button>
        {(pros.data?.length ?? 0) > 0 && (
          <button type="button" className={s.chip} aria-pressed={fromPros} onClick={() => pick("specialists")}>
            {tt("От\u00a0специалистов")}
            <span className={s.count}>{pros.data!.length}</span>
          </button>
        )}
        {(topics.data ?? []).map((t) => (
          <button key={t.value} type="button" className={s.chip} aria-pressed={topic === t.value} onClick={() => pick(t.value)}>
            {t.label}
            <span className={s.count}>{t.count}</span>
          </button>
        ))}
      </div>

      {articles.error ? (
        <ErrorBlock message={articles.error} onRetry={articles.reload} />
      ) : articles.loading && !articles.data ? (
        <div className={c.articleGrid}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <ArticleCardSkeleton key={i} />
          ))}
        </div>
      ) : articles.data && articles.data.length === 0 ? (
        <EmptyState art={<EmptyArt scene="moon" />}
          icon={<BookOpen size={28} strokeWidth={1.8} />}
          title={tt("Здесь пока пусто")}
          text={tt("Статьи на\u00a0эту тему скоро появятся. Загляните в\u00a0другие разделы.")}
        />
      ) : (
        <div className={`${c.articleGrid} ${c.articleRows}`} style={{ opacity: articles.loading ? 0.6 : 1 }}>
          {(articles.data ?? []).map((a) => (
            <ArticleCard key={a.id} a={a} />
          ))}
        </div>
      )}
    </>
  );
}

export default function ArticlesPage() {
  return (
    <Suspense fallback={null}>
      <Articles />
    </Suspense>
  );
}
