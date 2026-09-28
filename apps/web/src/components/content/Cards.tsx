import Link from "next/link";
import { Clock } from "lucide-react";
import type { ArticleCard as TArticle, PracticeCard as TPractice } from "@/lib/api/content";
import { Skeleton } from "@/ui";
import { TopicArt } from "@/components/illustrations/topics";
import { byline } from "./byline";
import art from "./art.module.css";
import s from "./content.module.css";
import { typo } from "@/lib/typography";
import { RatingBadge } from "./ArticleRating";

export function ArticleCard({ a, base = "/app", compact }: { a: TArticle; base?: string; compact?: boolean }) {
  return (
    <Link href={`${base}/articles/${a.slug}`} className={s.article} data-compact={compact || undefined}>
      {a.cover_image ? (
        <span className={`${s.cover} ${s.coverPhoto}`} aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={compact ? a.cover_image.sm : a.cover_image.md} alt="" loading="lazy" decoding="async" />
        </span>
      ) : (
        <span className={`${s.cover} ${s.tone}`} data-tone={a.cover} aria-hidden>
          <TopicArt topic={a.topic} className={art.coverArt} />
        </span>
      )}
      <span className={s.articleBody}>
        <span className={s.kicker}>
          {a.topic_label}
          {a.specialist && <span className={s.fromPro}>От&nbsp;специалиста</span>}
        </span>
        <span className={s.articleTitle}>{typo(a.title)}</span>
        {!compact && a.summary && <span className={s.articleSummary}>{typo(a.summary)}</span>}
        <span className={s.metaClip}>
          <span className={`${s.meta} ${s.articleMeta}`}>
            <span className={s.metaItem}>
              <Clock size={14} strokeWidth={1.8} aria-hidden />
              {a.reading_minutes}&nbsp;мин
            </span>
            <RatingBadge rating={a.rating} className={s.metaItem} />
            {byline(a).map((x) => (
              <span key={x} className={s.metaItem}>
                {x}
              </span>
            ))}
          </span>
        </span>
      </span>
    </Link>
  );
}

/** Quiet closing line of an article page: «25 сент. 2026 · ред. Анна Соколова». */
export function ArticleByline({ a }: { a: Pick<TArticle, "published_at" | "author_name" | "specialist"> }) {
  const parts = byline(a);
  if (!parts.length) return null;
  return (
    <p className={s.byline}>
      {a.published_at && <time dateTime={a.published_at}>{parts[0]}</time>}
      {parts.slice(a.published_at ? 1 : 0).map((x) => (
        <span key={x}>{x}</span>
      ))}
    </p>
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
        <TopicArt topic={p.kind} className={art.practiceArt} />
      </span>
      <span className={s.practiceText}>
        <span className={s.practiceTitle}>{typo(p.title)}</span>
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
