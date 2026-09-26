"use client";

import { useEffect, useState } from "react";
import { EyeOff, Star } from "lucide-react";
import { Button, Modal, Spinner, Textarea, useToast } from "@/ui";
import { ApiError } from "@/lib/api/client";
import { REVIEW_TAGS, reviewsApi, type MyReview } from "@/lib/api/reviews";
import { plural } from "@/lib/format";
import { RATING_WORD } from "./ReviewBits";
import s from "./reviews.module.css";

/**
 * Write or edit the client's single review of a specialist.
 * Checks eligibility itself (only after a completed call), so it can be opened from anywhere.
 */
export function ReviewModal({
  open,
  psychologistId,
  name,
  onClose,
  onSaved,
}: {
  open: boolean;
  psychologistId: number;
  name?: string;
  onClose: () => void;
  onSaved?: (r: MyReview | null) => void;
}) {
  const toast = useToast();
  const [state, setState] = useState<{ loading: boolean; can: boolean; calls: number; review: MyReview | null; error?: string }>({
    loading: true,
    can: false,
    calls: 0,
    review: null,
  });
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setState((x) => ({ ...x, loading: true, error: undefined }));
    reviewsApi
      .eligibility(psychologistId)
      .then((e) => {
        setState({ loading: false, can: e.can_review, calls: e.completed_calls, review: e.review });
        setRating(e.review?.rating ?? 0);
        setTags(e.review?.tags.map((t) => t.key) ?? []);
        setText(e.review?.text ?? "");
      })
      .catch((e) => setState({ loading: false, can: false, calls: 0, review: null, error: (e as Error).message }));
  }, [open, psychologistId]);

  const save = async () => {
    if (!rating) return;
    setBusy(true);
    try {
      const r = await reviewsApi.save(psychologistId, { rating, text: text.trim(), tags });
      toast(state.review ? "Отзыв обновлён" : "Спасибо! Отзыв опубликован");
      onSaved?.(r);
      onClose();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Не получилось сохранить отзыв", { error: true });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!state.review) return;
    setBusy(true);
    try {
      await reviewsApi.remove(state.review.id);
      toast("Отзыв удалён");
      onSaved?.(null);
      onClose();
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(false);
    }
  };

  const shown = hover || rating;
  const title = state.review ? "Ваш отзыв" : name ? `Отзыв о специалисте: ${name}` : "Отзыв о специалисте";

  return (
    <Modal open={open} onClose={() => !busy && onClose()} title={title} width={560}>
      {state.loading ? (
        <div style={{ display: "grid", placeItems: "center", minHeight: 160 }}>
          <Spinner label="Проверяем" />
        </div>
      ) : !state.can ? (
        <div className={s.form}>
          <p className={s.headNote}>
            {state.error ??
              "Отзыв можно оставить после созвона, который состоялся. Если созвон только что закончился, специалист отметит его проведённым, и здесь появится форма."}
          </p>
          <div className={s.actions}>
            <Button variant="primary" onClick={onClose}>
              Понятно
            </Button>
          </div>
        </div>
      ) : (
        <div className={s.form}>
          {state.review?.status === "hidden" && (
            <p className={s.status}>
              Модератор скрыл этот отзыв{state.review.hidden_reason ? `: ${state.review.hidden_reason}` : ""}. Исправьте его — или напишите в поддержку.
            </p>
          )}
          <div className={s.pick}>
            <div className={s.pickStars} role="radiogroup" aria-label="Оценка" onMouseLeave={() => setHover(0)}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={rating === n}
                  aria-label={`${n}: ${RATING_WORD[n]}`}
                  className={s.pickStar}
                  data-on={n <= shown || undefined}
                  onMouseEnter={() => setHover(n)}
                  onClick={() => setRating(n)}
                >
                  <Star size={30} />
                </button>
              ))}
            </div>
            <div className={s.pickWord}>{shown ? RATING_WORD[shown] : "Насколько вам помогли созвоны?"}</div>
          </div>

          <div>
            <div className={s.label}>Что запомнилось</div>
            <div className={s.chips}>
              {REVIEW_TAGS.map((t) => {
                const on = tags.includes(t.key);
                return (
                  <button
                    key={t.key}
                    type="button"
                    className={s.chip}
                    aria-pressed={on}
                    onClick={() => setTags((xs) => (on ? xs.filter((x) => x !== t.key) : [...xs, t.key]))}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          <Textarea
            label="Пара слов для других клиентов"
            rows={4}
            maxLength={2000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Что изменилось после созвонов, каково было говорить со специалистом. Не пишите личных подробностей"
            hint={`Необязательно. ${text.length} из 2000`}
          />

          <div className={s.anon}>
            <EyeOff size={18} aria-hidden />
            <span>
              Отзыв анонимный. Вместо псевдонима будет написано «Клиент, {state.calls}{" "}
              {plural(state.calls, "созвон", "созвона", "созвонов")}», дата — только месяц.
            </span>
          </div>

          <div className={s.actions}>
            {state.review && (
              <Button variant="ghost" className={s.left} onClick={remove} disabled={busy}>
                Удалить отзыв
              </Button>
            )}
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Отмена
            </Button>
            <Button variant="primary" loading={busy} disabled={!rating} onClick={save}>
              {state.review ? "Сохранить" : "Опубликовать"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
