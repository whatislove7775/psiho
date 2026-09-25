import Link from "next/link";
import { Clock } from "lucide-react";
import type { ArticleCard as TArticle, PracticeCard as TPractice } from "@/lib/api/content";
import { Skeleton } from "@/ui";
import s from "./content.module.css";

export function ArticleCard({ a, base = "/app", compact }: { a: TArticle; base?: string; compact?: boolean }) {
  return (
    <Link href={`${base}/articles/${a.slug}`} className={s.article} data-compact={compact || undefined}>
      <span className={`${s.cover} ${s.tone}`} data-tone={a.cover} aria-hidden>
        <span className={s.coverEmoji}>{a.emoji || "📖"}</span>
      </span>
      <span className={s.articleBody}>
        <span className={s.kicker}>{a.topic_label}</span>
        <span className={s.articleTitle}>{a.title}</span>
        {!compact && a.summary && <span className={s.articleSummary}>{a.summary}</span>}
        <span className={s.meta}>
          <Clock size={14} strokeWidth={1.8} aria-hidden />
          {a.reading_minutes} мин чтения
        </span>
      </span>
    </Link>
  );
}

export function ArticleCardSkeleton() {
  return (
    <div className={s.article} aria-hidden>
      <Skeleton height={112} radius={18} />
      <span className={s.articleBody}>
        <Skeleton width="40%" height={12} />
        <Skeleton width="90%" height={18} />
        <Skeleton width="70%" height={14} />
      </span>
    </div>
  );
}

export function PracticeCard({ p, base = "/app" }: { p: TPractice; base?: string }) {
  return (
    <Link href={`${base}/practices/${p.slug}`} className={s.practice}>
      <span className={`${s.practiceIcon} ${s.tone}`} data-tone={p.cover} aria-hidden>
        {p.emoji || "🌿"}
      </span>
      <span className={s.practiceText}>
        <span className={s.practiceTitle}>{p.title}</span>
        <span className={s.meta}>
          {p.kind_label}, {p.duration_minutes} мин
        </span>
      </span>
    </Link>
  );
}

export function PracticeCardSkeleton() {
  return (
    <div className={s.practice} aria-hidden>
      <Skeleton width={52} height={52} radius={26} />
      <span className={s.practiceText}>
        <Skeleton width="80%" height={16} />
        <Skeleton width="50%" height={12} />
      </span>
    </div>
  );
}
