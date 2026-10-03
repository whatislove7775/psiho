"use client";

import { t as tt } from "@/lib/i18n";
import { useCallback, useEffect, useState } from "react";
import { Flag, PenLine } from "lucide-react";
import { Badge, Button, Card, CardHead, Modal, Select, Skeleton, Textarea, useToast } from "@/ui";
import { useAuth } from "@/lib/auth/store";
import { REPORT_REASONS, type ReportReason } from "@/lib/api/staff";
import { monthLabel, ratingText, reviewsApi, type Review, type ReviewSummary } from "@/lib/api/reviews";
import { plural } from "@/lib/format";
import { ReviewModal } from "./ReviewModal";
import { Stars } from "./ReviewBits";
import s from "./reviews.module.css";

export function ReviewSummaryBlock({ summary }: { summary: ReviewSummary }) {
  const max = Math.max(1, ...Object.values(summary.distribution));
  return (
    <div className={s.summary}>
      <div className={s.big}>
        <span className={s.bigNum}>{ratingText(summary.rating)}</span>
        <Stars value={summary.rating ?? 0} size={18} />
        <span className={s.bigNote}>
          {summary.count} {plural(summary.count, "отзыв", "отзыва", "отзывов")}
        </span>
      </div>
      <div className={s.bars} aria-label={tt("Распределение оценок")}>
        {(["5", "4", "3", "2", "1"] as const).map((k) => (
          <div key={k} className={s.bar}>
            <span>{k}</span>
            <span className={s.track}>
              <span className={s.fill} style={{ width: `${(summary.distribution[k] / max) * 100}%` }} />
            </span>
            <span>{summary.distribution[k]}</span>
          </div>
        ))}
      </div>
      {summary.top_tags.length > 0 && (
        <div className={s.topTags}>
          {summary.top_tags.map((t) => (
            <Badge key={t.key} tone="sun">
              {t.label} <span style={{ opacity: 0.7 }}>{t.count}</span>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

export function ReviewItem({ r, onReport, children }: { r: Review; onReport?: (r: Review) => void; children?: React.ReactNode }) {
  return (
    <article className={s.review}>
      <div className={s.reviewTop}>
        <Stars value={r.rating} size={15} />
        <span className={s.who}>
          <b>{r.author_label}</b>, {monthLabel(r.month).toLowerCase()}
          {r.edited ? tt(", изменён") : ""}
        </span>
        {r.mine && <span className={s.mine}>{tt("Ваш отзыв")}</span>}
        {onReport && !r.mine && (
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            className={s.more}
            aria-label={tt("Пожаловаться на\u00a0отзыв")}
            icon={<Flag size={15} />}
            onClick={() => onReport(r)}
          />
        )}
      </div>
      {r.tags.length > 0 && (
        <div className={s.tags}>
          {r.tags.map((t) => (
            <Badge key={t.key}>{t.label}</Badge>
          ))}
        </div>
      )}
      {r.text && <p className={s.text}>{r.text}</p>}
      {r.reply && (
        <div className={s.reply}>
          <b>{tt("Ответ специалиста")}</b>
          {r.reply.text}
        </div>
      )}
      {children}
    </article>
  );
}

/** Public specialist page: summary + list + «Оставить отзыв» for clients with a completed call. */
export function ReviewsSection({ psychologistId, name }: { psychologistId: number; name: string }) {
  const user = useAuth((st) => st.user);
  const toast = useToast();
  const [data, setData] = useState<{ summary: ReviewSummary; results: Review[]; page: number; pages: number } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [canReview, setCanReview] = useState<{ can: boolean; has: boolean }>({ can: false, has: false });
  const [writing, setWriting] = useState(false);
  const [reporting, setReporting] = useState<Review | null>(null);

  const load = useCallback(() => {
    reviewsApi
      .list(psychologistId)
      .then((d) => setData(d))
      .catch(() => setData({ summary: { rating: null, count: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, top_tags: [] }, results: [], page: 1, pages: 1 }));
  }, [psychologistId]);
  useEffect(load, [load]);

  useEffect(() => {
    if (user?.role !== "client") return;
    reviewsApi
      .eligibility(psychologistId)
      .then((e) => setCanReview({ can: e.can_review, has: !!e.review }))
      .catch(() => {});
  }, [user?.role, psychologistId]);

  const more = async () => {
    if (!data) return;
    setLoadingMore(true);
    try {
      const next = await reviewsApi.list(psychologistId, data.page + 1);
      setData({ ...next, results: [...data.results, ...next.results] });
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setLoadingMore(false);
    }
  };

  const writeBtn = canReview.can ? (
    <Button variant="soft" size="sm" icon={<PenLine size={16} />} onClick={() => setWriting(true)}>
      {canReview.has ? tt("Изменить отзыв") : tt("Оставить отзыв")}
    </Button>
  ) : undefined;

  return (
    <Card as="section">
      <span id="reviews" style={{ display: "block", scrollMarginTop: 16 }} />
      <CardHead title={tt("Отзывы")} action={writeBtn} />
      {!data ? (
        <div style={{ display: "grid", gap: 12 }}>
          <Skeleton height={120} radius={18} />
          <Skeleton height={64} />
        </div>
      ) : data.summary.count === 0 ? (
        <p className={s.headNote}>{tt("Отзывов пока нет")}</p>
      ) : (
        <>
          <ReviewSummaryBlock summary={data.summary} />
          <div className={s.list} style={{ marginTop: 8 }}>
            {data.results.map((r) => (
              <ReviewItem key={r.id} r={r} onReport={user ? setReporting : undefined} />
            ))}
          </div>
          {data.page < data.pages && (
            <Button variant="ghost" block loading={loadingMore} onClick={more}>
              {tt("Показать ещё")}
            </Button>
          )}
        </>
      )}
      <ReviewModal
        open={writing}
        psychologistId={psychologistId}
        name={name}
        onClose={() => setWriting(false)}
        onSaved={(r) => {
          setCanReview((x) => ({ ...x, has: !!r }));
          load();
        }}
      />
      <ReportReviewModal review={reporting} onClose={() => setReporting(null)} />
    </Card>
  );
}

export function ReportReviewModal({ review, onClose }: { review: Review | null; onClose: () => void }) {
  const toast = useToast();
  const [reason, setReason] = useState<ReportReason>("abuse");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (review) {
      setReason("abuse");
      setComment("");
    }
  }, [review]);
  return (
    <Modal open={!!review} onClose={() => !busy && onClose()} title={tt("Пожаловаться на\u00a0отзыв")}>
      <div className={s.form}>
        <Select<ReportReason>
          label={tt("Что\u00a0не\u00a0так")}
          value={reason}
          onChange={setReason}
          options={REPORT_REASONS.filter((r) => ["abuse", "harassment", "spam", "fraud", "inappropriate", "other"].includes(r.value))}
        />
        <Textarea label={tt("Комментарий для\u00a0модератора")} rows={3} maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} hint={tt("Необязательно")} />
        <div className={s.actions}>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {tt("Отмена")}
          </Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={async () => {
              if (!review) return;
              setBusy(true);
              try {
                await reviewsApi.report(review.id, reason, comment.trim());
                toast(tt("Жалоба отправлена. Модератор посмотрит отзыв"));
                onClose();
              } catch (e) {
                toast((e as Error).message, { error: true });
              } finally {
                setBusy(false);
              }
            }}
          >
            {tt("Отправить")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
