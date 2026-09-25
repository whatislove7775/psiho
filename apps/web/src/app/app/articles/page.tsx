"use client";

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

function Articles() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname() ?? "/app/articles";
  const topic = params?.get("topic") ?? "";
  const topics = useLoad(() => contentApi.topics());
  const articles = useLoad(() => contentApi.articles({ topic: topic || undefined }), [topic]);

  const pick = (t: string) => router.replace(t ? `${pathname}?topic=${t}` : pathname, { scroll: false });

  return (
    <>
      <PageHeader title="Статьи" sub="Спокойно и по делу: о тревоге, отношениях, сне и о том, как устроена терапия." />

      <div className={s.chips} role="group" aria-label="Темы">
        <button type="button" className={s.chip} aria-pressed={!topic} onClick={() => pick("")}>
          Все темы
        </button>
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
        <EmptyState
          icon={<BookOpen size={28} strokeWidth={1.8} />}
          title="Здесь пока пусто"
          text="Статьи на эту тему скоро появятся. Загляните в другие разделы."
        />
      ) : (
        <div className={c.articleGrid} style={{ opacity: articles.loading ? 0.6 : 1 }}>
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
