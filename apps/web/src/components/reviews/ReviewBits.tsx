"use client";

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
    return showEmpty ? <span className={`${s.pill} ${s.pillNew}`}>Пока без отзывов</span> : null;
  }
  const label = `Рейтинг ${ratingText(rating)} из 5, ${count} ${plural(count, "отзыв", "отзыва", "отзывов")}`;
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
    <span className={s.stars} role="img" aria-label={`${value} из 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={size} data-on={n <= Math.round(value) || undefined} aria-hidden />
      ))}
    </span>
  );
}

export const RATING_WORD: Record<number, string> = {
  1: "Не помогло",
  2: "Скорее не помогло",
  3: "Нормально",
  4: "Хорошо",
  5: "Очень помогло",
};
