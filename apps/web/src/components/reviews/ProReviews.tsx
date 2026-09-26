"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageSquareReply } from "lucide-react";
import { Button, Card, CardHead, EmptyState, Skeleton, Textarea, useToast } from "@/ui";
import { EmptyArt } from "@/components/illustrations";
import { reviewsApi, type Review, type ReviewSummary } from "@/lib/api/reviews";
import { ReportReviewModal, ReviewItem, ReviewSummaryBlock } from "./ReviewsSection";
import s from "./reviews.module.css";

/** /pro/profile → «Отзывы клиентов»: summary + one reply per review. */
export function ProReviews() {
  const [data, setData] = useState<{ summary: ReviewSummary; results: Review[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reporting, setReporting] = useState<Review | null>(null);
  const load = useCallback(() => {
    reviewsApi
      .aboutMe()
      .then(setData)
      .catch((e) => setError((e as Error).message));
  }, []);
  useEffect(load, [load]);

  return (
    <Card as="section">
      <span id="reviews" style={{ display: "block", scrollMarginTop: 16 }} />
      <CardHead
        title="Отзывы клиентов"
        sub="Отзыв может оставить только клиент после состоявшегося созвона. Вы можете ответить на каждый один раз"
      />
      {error ? (
        <p className={s.headNote}>{error}</p>
      ) : !data ? (
        <Skeleton height={120} radius={18} />
      ) : data.summary.count === 0 ? (
        <EmptyState
          art={<EmptyArt scene="heart" />}
          title="Отзывов пока нет"
          text="После созвона клиент увидит приглашение оставить отзыв. Отзывы появятся здесь и на вашей странице."
        />
      ) : (
        <>
          <ReviewSummaryBlock summary={data.summary} />
          <div className={s.list} style={{ marginTop: 8 }}>
            {data.results.map((r) => (
              <ReviewItem key={r.id} r={r} onReport={setReporting}>
                <ReplyBox r={r} onDone={(x) => setData((d) => d && { ...d, results: d.results.map((y) => (y.id === x.id ? x : y)) })} />
              </ReviewItem>
            ))}
          </div>
        </>
      )}
      <ReportReviewModal review={reporting} onClose={() => setReporting(null)} />
    </Card>
  );
}

function ReplyBox({ r, onDone }: { r: Review; onDone: (r: Review) => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(r.reply?.text ?? "");
  const [busy, setBusy] = useState(false);
  if (!open) {
    return (
      <div>
        <Button variant="ghost" size="sm" icon={<MessageSquareReply size={16} />} onClick={() => setOpen(true)}>
          {r.reply ? "Изменить ответ" : "Ответить"}
        </Button>
      </div>
    );
  }
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <Textarea
        aria-label="Ваш ответ"
        rows={3}
        maxLength={1500}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Поблагодарите или спокойно поясните. Не упоминайте детали созвонов: ответ видят все"
      />
      <div className={s.actions}>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={busy}>
          Отмена
        </Button>
        <Button
          variant="primary"
          size="sm"
          loading={busy}
          disabled={text.trim().length < 2}
          onClick={async () => {
            setBusy(true);
            try {
              onDone(await reviewsApi.reply(r.id, text.trim()));
              setOpen(false);
              toast("Ответ опубликован");
            } catch (e) {
              toast((e as Error).message, { error: true });
            } finally {
              setBusy(false);
            }
          }}
        >
          Опубликовать ответ
        </Button>
      </div>
    </div>
  );
}
