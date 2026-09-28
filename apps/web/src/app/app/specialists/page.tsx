"use client";

import { FactsLine } from "@/components/specialists/SpecialistFacts";
import { RatingPill } from "@/components/reviews/ReviewBits";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarClock, ListChecks, Search, SearchX, X } from "lucide-react";
import { topicTone } from "@/lib/topicTone";
import { Badge, Button, Card, EmptyState, Skeleton } from "@/ui";
import { PageHeader } from "@/components/shell/AppShell";
import { SpecialistPhoto } from "@/components/avatar/SpecialistPhoto";
import { durationLabel } from "@/lib/api/availability";
import {
  queryToSearchParams,
  searchApi,
  searchParamsToQuery,
  type SearchFacets,
  type SortOrder,
  type SpecialistQuery,
} from "@/lib/api/search";
import { plural, rub, when } from "@/lib/format";
import { useLoad } from "@/components/client/useLoad";
import { ErrorBlock } from "@/components/client/ClientBits";
import { FilterBar } from "@/components/search/FilterBar";
import { IntroChip } from "@/components/matching/IntroChip";
import s from "./specialists.module.css";
import { EmptyArt } from "@/components/illustrations";

// Per-viewer convenience: the chosen sort order is remembered on this device (topics are not — privacy)
const SORT_KEY = "aprosop.search.sort";
const SORT_VALUES: SortOrder[] = ["price", "soon", "rating", "experience"];

export default function SpecialistsPage() {
  // useSearchParams needs a Suspense boundary in the App Router
  return (
    <Suspense fallback={null}>
      <Specialists />
    </Suspense>
  );
}

/** Filters live in the URL (?q=&topic=&when=…), so «Показать всех» from the search palette lands here as is. */
function Specialists() {
  const router = useRouter();
  const pathname = usePathname() ?? "/app/specialists";
  const params = useSearchParams();
  const urlKey = params?.toString() ?? "";
  const query = useMemo(() => searchParamsToQuery(new URLSearchParams(urlKey)), [urlKey]);
  const [q, setQ] = useState(query.q ?? "");
  const [facets, setFacets] = useState<SearchFacets | null>(null);
  const typing = useRef(false);

  const apply = (next: SpecialistQuery) => {
    if (next.sort !== query.sort) {
      try {
        if (next.sort) localStorage.setItem(SORT_KEY, next.sort);
        else localStorage.removeItem(SORT_KEY);
      } catch {
        /* storage unavailable */
      }
    }
    const qs = queryToSearchParams(next).toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  // Restore the remembered sort once, when the link doesn't set one
  useEffect(() => {
    if (query.sort) return;
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(SORT_KEY);
    } catch {
      /* storage unavailable */
    }
    if (saved && SORT_VALUES.includes(saved as SortOrder)) apply({ ...query, sort: saved as SortOrder });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    searchApi.facets().then(setFacets).catch(() => undefined);
  }, []);

  // URL → input (back/forward, palette), unless the person is typing
  useEffect(() => {
    if (!typing.current) setQ(query.q ?? "");
  }, [query.q]);

  // input → URL (debounced)
  useEffect(() => {
    if (!typing.current) return;
    const t = setTimeout(() => {
      typing.current = false;
      if ((query.q ?? "") !== q.trim()) apply({ ...query, q: q.trim() || undefined });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const res = useLoad(() => searchApi.list(query), [urlKey]);
  const list = res.data ?? [];

  const selectedTopics = query.topics ?? [];

  const reset = () => {
    typing.current = false;
    setQ("");
    apply(query.sort ? { sort: query.sort } : {});
  };

  return (
    <>
      <PageHeader
        title="Специалисты"
        action={
          // H1: quiz-based matching
          <Button variant="soft" size="sm" href="/app/match" icon={<ListChecks size={16} strokeWidth={1.8} />}>
            Подобрать по&nbsp;анкете
          </Button>
        }
      />

      <Card as="section" className={s.filters}>
        <div className={s.filterTop}>
          <label className={s.search}>
            <Search size={20} strokeWidth={1.8} aria-hidden />
            <input
              type="search"
              value={q}
              onChange={(e) => {
                typing.current = true;
                setQ(e.target.value);
              }}
              placeholder="Тревога, отношения, имя специалиста"
              aria-label="Поиск специалиста"
            />
            {q && (
              <button
                type="button"
                className={s.clear}
                onClick={() => {
                  typing.current = true;
                  setQ("");
                }}
                aria-label="Очистить поиск"
              >
                <X size={16} strokeWidth={2} />
              </button>
            )}
          </label>
        </div>
        <FilterBar value={query} onChange={apply} facets={facets} count={res.data ? list.length : null} showSort />
      </Card>

      <div className={s.meta} aria-live="polite">
        {res.loading
          ? "Ищем специалистов"
          : !res.error &&
            `${list.length} ${plural(list.length, "специалист", "специалиста", "специалистов")}`}
      </div>

      {res.error ? (
        <ErrorBlock message={res.error} onRetry={res.reload} />
      ) : res.loading && !res.data ? (
        <div className={s.list}>
          {[0, 1, 2].map((i) => (
            <Card key={i} className={s.item}>
              <Skeleton width={112} height={112} radius={56} />
              <div className={s.body}>
                <Skeleton width="40%" height={22} />
                <Skeleton width="85%" height={14} />
                <Skeleton width="60%" height={14} />
              </div>
            </Card>
          ))}
        </div>
      ) : list.length === 0 ? (
        <Card>
          <EmptyState art={<EmptyArt scene="search" />}
            icon={<SearchX size={24} strokeWidth={1.8} />}
            title="Никого не&nbsp;нашли"
            text="Попробуйте другое слово или&nbsp;уберите один из&nbsp;фильтров: тему, время или&nbsp;цену."
            action={
              <Button variant="primary" onClick={reset}>
                Показать всех специалистов
              </Button>
            }
          />
        </Card>
      ) : (
        <div className={s.list} style={{ opacity: res.loading ? 0.6 : 1 }}>
          {list.map((p) => (
            <Card as="article" key={p.id} className={s.item}>
              <SpecialistPhoto url={p.photo_url} name={p.display_name} size={112} alt="" />
              <div className={s.body}>
                <div className={s.nameRow}>
                  <h2 className={s.name}>{p.display_name}</h2>
                  <span className={s.exp}>
                    Опыт {p.experience_years}{" "}
                    {plural(p.experience_years, "год", "года", "лет")}
                  </span>
                  <FactsLine p={p} className={s.exp} />
                  <RatingPill rating={p.rating} count={p.reviews_count} />
                  <IntroChip psy={p} />
                </div>
                <p className={s.bio}>{p.bio}</p>
                <div className={s.badges}>
                  {p.specializations.map((x) => (
                    <Badge key={x} tone={selectedTopics.includes(x) ? "primary" : topicTone(x)}>
                      {x}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className={s.side}>
                <div className={s.rate}>
                  {(() => {
                    const d = query.duration ? p.booking?.durations.find((x) => x.minutes === query.duration) : undefined;
                    return (
                      <>
                        <strong>{d ? rub(d.price_rub) : `от\u00a0${rub(p.session_rate_rub)}`}</strong>
                        <span>за {durationLabel(d?.minutes ?? p.booking?.min_duration ?? 50)}</span>
                      </>
                    );
                  })()}
                </div>
                <div className={s.slot} data-none={p.next_slot ? undefined : ""}>
                  <CalendarClock size={16} strokeWidth={1.8} aria-hidden />
                  {p.next_slot ? (
                    <>Свободно {lower(when(p.next_slot))}</>
                  ) : (
                    "Нет свободных окон"
                  )}
                </div>
                <Button
                  variant="primary"
                  href={`/app/specialists/${p.id}`}
                  block
                >
                  Выбрать время
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

function lower(x: string) {
  return /^(Сегодня|Завтра|Вчера)/.test(x)
    ? x.charAt(0).toLowerCase() + x.slice(1)
    : x;
}
