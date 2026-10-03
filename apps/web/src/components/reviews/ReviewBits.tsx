"use client";

import { t } from "@/lib/i18n";
import { Star } from "lucide-react";
import { plural } from "@/lib/format";
import { ratingText } from "@/lib/api/reviews";
import s from "./reviews.module.css";

/** «★ 4,8 (12 отзывов)» for cards and search rows. Renders nothing without reviews unless `showEmpty`. */
export function RatingPill({
  rating,
  count,
  href,
  compact,
  showEmpty,
}: {
  rating: number | null | undefined;
  count: number | undefined;
  href?: string;
  compact?: boolean;
  showEmpty?: boolean;
}) {
  if (!count || rating == null) {
    return showEmpty ? <span className={`${s.pill} ${s.pillNew}`}>{t("Пока без\u00a0отзывов")}</span> : null;
  }
  const label = t(`Рейтинг {ratingText} из\u00a05, {count} {plural}`, { ratingText: ratingText(rating), count, plural: plural(count, "отзыв", "отзыва", "отзывов") });
  const body = (
    <>
      <Star size={14} aria-hidden />
      <b>{ratingText(rating)}</b>
      <span>{compact ? `(${count})` : `${count} ${plural(count, "отзыв", "отзыва", "отзывов")}`}</span>
    </>
  );
  return href ? (
    <a className={s.pill} href={href} aria-label={label}>
      {body}
    </a>
  ) : (
    <span className={s.pill} aria-label={label} role="img">
      {body}
    </span>
  );
}

export function Stars({ value, size = 16 }: { value: number; size?: number }) {
  return (
    <span className={s.stars} role="img" aria-label={t(`{value} из\u00a05`, { value })}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={size} data-on={n <= Math.round(value) || undefined} aria-hidden />
      ))}
    </span>
  );
}

export const RATING_WORD: Record<number, string> = {
  get 1() { return t("Не\u00a0помогло"); },
  get 2() { return t("Скорее не\u00a0помогло"); },
  get 3() { return t("Нормально"); },
  get 4() { return t("Хорошо"); },
  get 5() { return t("Очень помогло"); },
};
