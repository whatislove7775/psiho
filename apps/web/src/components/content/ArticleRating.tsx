"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Star } from "lucide-react";
import { useToast } from "@/ui";
import { useAuth } from "@/lib/auth/store";
import { ApiError } from "@/lib/api/client";
import { ratingApi, type RatingState } from "@/lib/api/articles";
import { plural } from "@/lib/format";
import s from "./rating.module.css";

const fmt = (avg: number) => avg.toLocaleString("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Quiet «★ 4,6 · 12» for headers and cards; nothing while there are no ratings. */
export function RatingBadge({ rating, className }: { rating?: { avg: number | null; count: number }; className?: string }) {
  if (!rating?.count || rating.avg == null) return null;
  return (
    <span className={`${s.badge} ${className ?? ""}`} title={`Средняя оценка читателей: ${fmt(rating.avg)} из 5`}>
      <Star size={13} strokeWidth={0} fill="currentColor" aria-hidden />
      {fmt(rating.avg)}
      <span className={s.count}>· {rating.count}</span>
    </span>
  );
}

/**
 * «Оцените статью»: 1–5 stars for signed-in clients and specialists (not the author), one per person,
 * changeable. Guests see the average and a sign-in link. Only the average and count are public.
 */
export function ArticleRating({ slug, initial, loginNext }: { slug: string; initial?: { avg: number | null; count: number }; loginNext: string }) {
  const { status, bootstrap } = useAuth();
  const toast = useToast();
  const [state, setState] = useState<RatingState>({ avg: initial?.avg ?? null, count: initial?.count ?? 0, mine: null, can_rate: false });
  const [hover, setHover] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => void bootstrap(), [bootstrap]);
  useEffect(() => {
    if (status === "loading" || status === "idle") return;
    let alive = true;
    ratingApi
      .get(slug, status === "authed")
      .then((r) => alive && setState(r))
      .catch(() => null);
    return () => {
      alive = false;
    };
  }, [slug, status]);

  const rate = async (n: number) => {
    if (busy) return;
    setBusy(true);
    const prev = state;
    setState({ ...state, mine: n });
    try {
      setState(n === prev.mine ? await ratingApi.clear(slug) : await ratingApi.set(slug, n));
    } catch (e) {
      setState(prev);
      toast(e instanceof ApiError ? e.message : "Не получилось сохранить оценку", { error: true });
    } finally {
      setBusy(false);
    }
  };

  const shown = hover || state.mine || 0;
  const summary =
    state.count && state.avg != null
      ? `${fmt(state.avg)} · ${state.count} ${plural(state.count, "оценка", "оценки", "оценок")}`
      : "Оценок пока нет";

  return (
    <section className={s.box} aria-label="Оценка статьи">
      <span className={s.label}>{state.mine ? "Ваша оценка" : "Оцените статью"}</span>
      {state.can_rate ? (
        <div className={s.stars} role="radiogroup" aria-label="Оценка от 1 до 5" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={state.mine === n}
              aria-label={`${n} из 5`}
              className={s.star}
              data-on={n <= shown || undefined}
              disabled={busy}
              onMouseEnter={() => setHover(n)}
              onFocus={() => setHover(n)}
              onBlur={() => setHover(0)}
              onClick={() => rate(n)}
            >
              <Star size={22} strokeWidth={1.7} />
            </button>
          ))}
        </div>
      ) : (
        <div className={s.stars} aria-hidden>
          {[1, 2, 3, 4, 5].map((n) => (
            <span key={n} className={s.star} data-on={state.avg != null && n <= Math.round(state.avg) ? true : undefined} data-static>
              <Star size={22} strokeWidth={1.7} />
            </span>
          ))}
        </div>
      )}
      <span className={s.summary}>
        {summary}
        {status === "guest" && (
          <>
            {" · "}
            <Link href={`/login?next=${encodeURIComponent(loginNext)}`}>Войдите, чтобы оценить</Link>
          </>
        )}
      </span>
    </section>
  );
}
