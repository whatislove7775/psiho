"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Search, SearchX, X } from "lucide-react";
import { Badge, Button, Card, EmptyState, Segmented, Skeleton } from "@/ui";
import { PageHeader } from "@/components/shell/AppShell";
import { AvatarThumb } from "@/components/avatar/AvatarThumb";
import { psychologistsApi } from "@/lib/api/endpoints";
import { plural, rub, when } from "@/lib/format";
import { useLoad } from "@/components/client/useLoad";
import { ErrorBlock } from "@/components/client/ClientBits";
import s from "./specialists.module.css";

type Price = "any" | "3000" | "4000" | "5000";

export default function SpecialistsPage() {
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [price, setPrice] = useState<Price>("any");
  const [spec, setSpec] = useState<string | null>(null);

  // debounce typing
  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const res = useLoad(
    () =>
      psychologistsApi.list({
        q: query || undefined,
        max_rate: price === "any" ? undefined : Number(price),
      }),
    [query, price],
  );

  const all = res.data ?? [];
  // Chips come from the current results so every chip leads somewhere.
  const specs = useMemo(() => {
    const set = new Set<string>();
    all.forEach((p) => p.specializations.forEach((x) => set.add(x)));
    if (spec) set.add(spec);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ru"));
  }, [all, spec]);
  const list = spec ? all.filter((p) => p.specializations.includes(spec)) : all;

  const filtered = !!(query || spec || price !== "any");
  const reset = () => {
    setQ("");
    setQuery("");
    setSpec(null);
    setPrice("any");
  };

  return (
    <>
      <PageHeader
        title="Специалисты"
        sub="Каждый психолог прошёл проверку диплома и опыта. Выберите того, чей подход вам откликается."
      />

      <Card as="section" className={s.filters}>
        <div className={s.filterTop}>
          <label className={s.search}>
            <Search size={20} strokeWidth={1.8} aria-hidden />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Тревога, отношения, имя специалиста"
              aria-label="Поиск специалиста"
            />
            {q && (
              <button
                type="button"
                className={s.clear}
                onClick={() => setQ("")}
                aria-label="Очистить поиск"
              >
                <X size={16} strokeWidth={2} />
              </button>
            )}
          </label>
          <div className={s.price}>
            <span className={s.priceLabel} id="price-label">
              Цена за 50 минут
            </span>
            <Segmented<Price>
              ariaLabel="Цена за 50 минут"
              value={price}
              onChange={setPrice}
              options={[
                { value: "any", label: "Любая" },
                { value: "3000", label: "до 3000" },
                { value: "4000", label: "до 4000" },
                { value: "5000", label: "до 5000" },
              ]}
            />
          </div>
        </div>
        {specs.length > 0 && (
          <div className={s.chips} role="group" aria-label="С чем работает">
            <button
              type="button"
              className={s.chip}
              aria-pressed={!spec}
              onClick={() => setSpec(null)}
            >
              Все темы
            </button>
            {specs.map((x) => (
              <button
                key={x}
                type="button"
                className={s.chip}
                aria-pressed={spec === x}
                onClick={() => setSpec(spec === x ? null : x)}
              >
                {x}
              </button>
            ))}
          </div>
        )}
      </Card>

      <div className={s.meta} aria-live="polite">
        {res.loading
          ? "Ищем специалистов"
          : !res.error &&
            `${list.length} ${plural(list.length, "специалист", "специалиста", "специалистов")}`}
        {filtered && !res.loading && (
          <button type="button" className={s.resetLink} onClick={reset}>
            Сбросить фильтры
          </button>
        )}
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
          <EmptyState
            icon={<SearchX size={24} strokeWidth={1.8} />}
            title="Никого не нашли"
            text="Попробуйте другое слово, уберите тему или поднимите верхнюю границу цены."
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
              <AvatarThumb
                config={p.avatar_config}
                seed={`psy-${p.id}`}
                size={112}
                alt=""
              />
              <div className={s.body}>
                <div className={s.nameRow}>
                  <h2 className={s.name}>{p.display_name}</h2>
                  <span className={s.exp}>
                    Опыт {p.experience_years}{" "}
                    {plural(p.experience_years, "год", "года", "лет")}
                  </span>
                </div>
                <p className={s.bio}>{p.bio}</p>
                <div className={s.badges}>
                  {p.specializations.map((x) => (
                    <Badge key={x} tone={x === spec ? "primary" : "neutral"}>
                      {x}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className={s.side}>
                <div className={s.rate}>
                  <strong>{rub(p.session_rate_rub)}</strong>
                  <span>за 50 минут</span>
                </div>
                <div className={s.slot}>
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
