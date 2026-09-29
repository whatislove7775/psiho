"use client";

/**
 * Specialist filters, shared by the search palette and /app/specialists.
 * One compact row of pills (Запрос · Подход · Цена · Когда · Ещё · sort). Each pill opens a popover
 * (bottom sheet on phones) with multi-select, a price range, flexible time, etc. Changes apply at
 * once; the popover footer shows the live count. Active values show below as removable chips.
 */
import { useMemo, useState, type ReactNode } from "react";
import { ArrowDownUp, Banknote, Check, Clock3, MessageCircleHeart, Search, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { Select } from "@/ui";
import { durationLabel } from "@/lib/api/availability";
import { fromYearsLabel } from "@/lib/format";
import { hasTime, type GenderFilter, type SearchFacets, type SortOrder, type SpecialistQuery, type TimeOfDay, type WhenFilter } from "@/lib/api/search";
import { FilterPopover } from "./FilterPopover";
import s from "./filters.module.css";

const ic = { size: 15, strokeWidth: 1.9, "aria-hidden": true } as const;
const nf = new Intl.NumberFormat("ru-RU");

export const SORTS: { value: SortOrder; label: string }[] = [
  { value: "relevance", label: "Подходящие" },
  { value: "price", label: "Дешевле" },
  { value: "soon", label: "Ближайшее окно" },
  { value: "rating", label: "Рейтинг" },
];

const PRESETS: { value: WhenFilter; label: string }[] = [
  { value: "today", label: "Сегодня" },
  { value: "3days", label: "В\u00a0ближайшие 3\u00a0дня" },
  { value: "weekend", label: "В\u00a0выходные" },
];
const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const TIMES: { value: TimeOfDay; label: string; hint: string }[] = [
  { value: "morning", label: "Утро", hint: "6–12" },
  { value: "day", label: "День", hint: "12–18" },
  { value: "evening", label: "Вечер", hint: "после 18" },
];
const EXPERIENCE = [3, 5, 10];
const GENDER_LABEL: Record<GenderFilter, string> = { female: "Женщина", male: "Мужчина" };

const toggle = <T,>(list: T[] | undefined, v: T): T[] | undefined => {
  const cur = list ?? [];
  const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
  return next.length ? next : undefined;
};
const rubShort = (n: number) => `${nf.format(n)} ₽`;
const dateShort = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("ru-RU", { day: "numeric", month: "short" }).replace(".", "");
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Short description of the time filters, e.g. «Сб, Вс · вечер · 3–10 окт». */
export function timeSummary(q: SpecialistQuery): string {
  const parts: string[] = [];
  if (q.when) parts.push(PRESETS.find((p) => p.value === q.when)?.label ?? "Вечером");
  if (q.days?.length) {
    const d = [...q.days].sort((a, b) => a - b);
    const weekdays = d.length === 5 && d.every((x, i) => x === i);
    const weekend = d.length === 2 && d[0] === 5 && d[1] === 6;
    parts.push(weekdays ? "Будни" : weekend ? "Сб, Вс" : d.map((x) => WEEKDAYS[x]).join(", "));
  }
  if (q.times?.length) parts.push(TIMES.filter((t) => q.times!.includes(t.value)).map((t) => t.label.toLowerCase()).join(", "));
  if (q.date_from || q.date_to) {
    if (q.date_from && q.date_to) parts.push(q.date_from === q.date_to ? dateShort(q.date_from) : `${dateShort(q.date_from)} – ${dateShort(q.date_to)}`);
    else if (q.date_from) parts.push(`с\u00a0${dateShort(q.date_from)}`);
    else parts.push(`до\u00a0${dateShort(q.date_to!)}`);
  }
  return parts.join(" · ");
}

function priceSummary(q: SpecialistQuery): string {
  if (q.min_rate && q.max_rate) return `${nf.format(q.min_rate)}–${rubShort(q.max_rate)}`;
  if (q.max_rate) return `до\u00a0${rubShort(q.max_rate)}`;
  if (q.min_rate) return `от\u00a0${rubShort(q.min_rate)}`;
  return "";
}

// ── Building blocks ─────────────────────────────────────────────────────────

export function CheckList({
  options,
  selected,
  onToggle,
  searchable,
}: {
  options: { value: string; label: string; count?: number }[];
  selected: string[];
  onToggle: (v: string) => void;
  searchable?: boolean;
}) {
  const [q, setQ] = useState("");
  const shown = q.trim() ? options.filter((o) => o.label.toLowerCase().includes(q.trim().toLowerCase())) : options;
  return (
    <>
      {searchable && (
        <label className={s.find}>
          <Search size={15} strokeWidth={1.9} aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти" aria-label="Найти в&nbsp;списке" data-autofocus />
        </label>
      )}
      <ul className={s.checks} role="group">
        {shown.map((o) => {
          const on = selected.includes(o.value);
          return (
            <li key={o.value}>
              <button type="button" role="checkbox" aria-checked={on} className={s.check} onClick={() => onToggle(o.value)}>
                <span className={s.box} aria-hidden>
                  {on && <Check size={13} strokeWidth={3} />}
                </span>
                <span className={s.checkLabel}>{o.label}</span>
                {o.count != null && <span className={s.checkCount}>{o.count}</span>}
              </button>
            </li>
          );
        })}
        {shown.length === 0 && <li className={s.none}>Ничего не&nbsp;нашли</li>}
      </ul>
    </>
  );
}

function Chips<T extends string | number>({
  options,
  isOn,
  onToggle,
  label,
  wide,
}: {
  options: { value: T; label: ReactNode; hint?: string }[];
  isOn: (v: T) => boolean;
  onToggle: (v: T) => void;
  label: string;
  wide?: boolean;
}) {
  return (
    <div className={s.chipGroup} role="group" aria-label={label} data-wide={wide ? "" : undefined}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" className={s.chip} aria-pressed={isOn(o.value)} onClick={() => onToggle(o.value)}>
          {o.label}
          {o.hint && <small>{o.hint}</small>}
        </button>
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={s.section}>
      <h3 className={s.sectionTitle}>{title}</h3>
      {children}
    </section>
  );
}

function PriceRange({
  min,
  max,
  value,
  onChange,
}: {
  min: number;
  max: number;
  value: { lo?: number; hi?: number };
  onChange: (lo: number | undefined, hi: number | undefined) => void;
}) {
  const step = 250;
  const lo = Math.max(min, Math.min(value.lo ?? min, max));
  const hi = Math.min(max, Math.max(value.hi ?? max, min));
  const pct = (v: number) => ((v - min) / Math.max(1, max - min)) * 100;
  const emit = (a: number, b: number) => onChange(a <= min ? undefined : a, b >= max ? undefined : b);
  const mid = Math.round((min + (max - min) / 2) / 500) * 500;
  const presets = [
    { label: `до\u00a0${nf.format(mid)}`, lo: undefined, hi: mid },
    { label: `${nf.format(mid)}+`, lo: mid, hi: undefined },
  ].filter((p) => (p.hi ?? max) > min && (p.lo ?? min) < max);
  return (
    <div className={s.price}>
      <div className={s.priceNow} aria-live="polite">
        {rubShort(lo)} — {rubShort(hi)}
      </div>
      <div className={s.range} style={{ ["--lo" as string]: `${pct(lo)}%`, ["--hi" as string]: `${pct(hi)}%` }}>
        <span className={s.track} aria-hidden />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={lo}
          aria-label="Цена от"
          aria-valuetext={rubShort(lo)}
          onChange={(e) => emit(Math.min(Number(e.target.value), hi - step), hi)}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={hi}
          aria-label="Цена до"
          aria-valuetext={rubShort(hi)}
          onChange={(e) => emit(lo, Math.max(Number(e.target.value), lo + step))}
        />
      </div>
      <div className={s.chipGroup} role="group" aria-label="Быстрый выбор цены">
        {presets.map((p) => (
          <button
            key={p.label}
            type="button"
            className={s.chip}
            aria-pressed={value.lo === p.lo && value.hi === p.hi}
            onClick={() => onChange(p.lo, p.hi)}
          >
            {p.label} ₽
          </button>
        ))}
      </div>
      <p className={s.note}>За&nbsp;созвон минимальной длительности</p>
    </div>
  );
}

// ── The bar ─────────────────────────────────────────────────────────────────

export function FilterBar({
  value,
  onChange,
  facets,
  count,
  showSort = false,
  className,
}: {
  value: SpecialistQuery;
  onChange: (next: SpecialistQuery) => void;
  facets: SearchFacets | null;
  /** live number of results for the current filters */
  count?: number | null;
  showSort?: boolean;
  className?: string;
}) {
  const set = (patch: Partial<SpecialistQuery>) => onChange({ ...value, ...patch });
  const topics = facets?.topics ?? [];
  const approaches = facets?.approaches ?? [];
  const durations = facets?.durations ?? [];
  const languages = facets?.languages ?? [];
  const priceMin = Math.floor((facets?.price.min ?? 0) / 500) * 500;
  const priceMax = Math.ceil((facets?.price.max ?? 0) / 500) * 500;

  const nTopics = value.topics?.length ?? 0;
  const nApproaches = value.approaches?.length ?? 0;
  const priceOn = !!(value.min_rate || value.max_rate);
  const timeOn = hasTime(value);
  const more = [value.duration, value.min_experience, value.gender, value.language, value.intro].filter(Boolean).length;

  // Topic options: known facets + any chosen topic that isn't among them (from a link)
  const topicOptions = useMemo(() => {
    const opts: { value: string; label: string; count?: number }[] = topics.map((t) => ({ value: t.label, label: t.label, count: t.count }));
    for (const t of value.topics ?? []) if (!opts.some((o) => o.value === t)) opts.unshift({ value: t, label: t });
    return opts;
  }, [topics, value.topics]);

  const chips: { key: string; label: string; clear: () => void }[] = [];
  for (const t of value.topics ?? []) chips.push({ key: `t:${t}`, label: t, clear: () => set({ topics: toggle(value.topics, t) }) });
  for (const a of value.approaches ?? [])
    chips.push({ key: `a:${a}`, label: approaches.find((x) => x.value === a)?.label ?? a, clear: () => set({ approaches: toggle(value.approaches, a) }) });
  if (priceOn) chips.push({ key: "price", label: priceSummary(value), clear: () => set({ min_rate: undefined, max_rate: undefined }) });
  if (timeOn)
    chips.push({
      key: "time",
      label: timeSummary(value),
      clear: () => set({ when: undefined, days: undefined, times: undefined, date_from: undefined, date_to: undefined }),
    });
  if (value.duration) chips.push({ key: "dur", label: `Созвон ${durationLabel(value.duration)}`, clear: () => set({ duration: undefined }) });
  if (value.min_experience) chips.push({ key: "exp", label: `Опыт ${fromYearsLabel(value.min_experience)}`, clear: () => set({ min_experience: undefined }) });
  if (value.gender) chips.push({ key: "g", label: GENDER_LABEL[value.gender], clear: () => set({ gender: undefined }) });
  if (value.language) chips.push({ key: "l", label: value.language, clear: () => set({ language: undefined }) });
  if (value.intro) chips.push({ key: "i", label: "Знакомство 15\u00a0мин", clear: () => set({ intro: undefined }) });

  const resetAll = () =>
    onChange({ q: value.q, sort: value.sort });

  return (
    <div className={`${s.bar} ${className ?? ""}`}>
      <div className={s.row} role="group" aria-label="Фильтры">
        {topicOptions.length > 0 && (
          <FilterPopover
            label="Запрос"
            icon={<MessageCircleHeart {...ic} />}
            badge={nTopics}
            active={nTopics > 0}
            title="С&nbsp;чем&nbsp;хотите работать"
            count={count}
            onReset={() => set({ topics: undefined })}
          >
            <CheckList
              options={topicOptions}
              selected={value.topics ?? []}
              onToggle={(t) => set({ topics: toggle(value.topics, t) })}
              searchable={topicOptions.length > 8}
            />
          </FilterPopover>
        )}
        {approaches.length > 0 && (
          <FilterPopover
            label="Подход"
            icon={<Sparkles {...ic} />}
            badge={nApproaches}
            active={nApproaches > 0}
            title="Метод работы"
            count={count}
            onReset={() => set({ approaches: undefined })}
          >
            <CheckList
              options={approaches.map((a) => ({ value: a.value, label: a.label, count: a.count }))}
              selected={value.approaches ?? []}
              onToggle={(a) => set({ approaches: toggle(value.approaches, a) })}
            />
          </FilterPopover>
        )}
        {priceMax > priceMin && (
          <FilterPopover
            label="Цена"
            icon={<Banknote {...ic} />}
            active={priceOn}
            title="Цена"
            count={count}
            onReset={() => set({ min_rate: undefined, max_rate: undefined })}
          >
            <PriceRange
              min={priceMin}
              max={priceMax}
              value={{ lo: value.min_rate, hi: value.max_rate }}
              onChange={(lo, hi) => set({ min_rate: lo, max_rate: hi })}
            />
          </FilterPopover>
        )}
        <FilterPopover
          label="Когда"
          icon={<Clock3 {...ic} />}
          badge={timeOn ? [value.when, value.days?.length, value.times?.length, value.date_from || value.date_to].filter(Boolean).length : 0}
          active={timeOn}
          title="Когда удобно"
          count={count}
          width={380}
          onReset={() => set({ when: undefined, days: undefined, times: undefined, date_from: undefined, date_to: undefined })}
        >
          <Chips
            label="Быстрый выбор"
            options={PRESETS}
            isOn={(v) => value.when === v}
            onToggle={(v) => set({ when: value.when === v ? undefined : v })}
          />
          <Section title="Дни недели">
            <Chips
              label="Дни недели"
              wide
              options={WEEKDAYS.map((d, i) => ({ value: i, label: d }))}
              isOn={(v) => !!value.days?.includes(v)}
              onToggle={(v) => set({ days: toggle(value.days, v)?.sort((a, b) => a - b) })}
            />
          </Section>
          <Section title="Время суток">
            <Chips
              label="Время суток"
              wide
              options={TIMES}
              isOn={(v) => !!value.times?.includes(v)}
              onToggle={(v) => set({ times: toggle(value.times, v) })}
            />
          </Section>
          <Section title="Даты">
            <div className={s.dates}>
              <input
                type="date"
                className={s.date}
                aria-label="С&nbsp;даты"
                min={todayIso()}
                value={value.date_from ?? ""}
                onChange={(e) => {
                  const v = e.target.value || undefined;
                  set({ date_from: v, date_to: v && value.date_to && value.date_to < v ? v : value.date_to });
                }}
              />
              <span aria-hidden>—</span>
              <input
                type="date"
                className={s.date}
                aria-label="По&nbsp;дату"
                min={value.date_from ?? todayIso()}
                value={value.date_to ?? ""}
                onChange={(e) => set({ date_to: e.target.value || undefined })}
              />
            </div>
          </Section>
        </FilterPopover>
        <FilterPopover
          label="Ещё"
          icon={<SlidersHorizontal {...ic} />}
          badge={more}
          active={more > 0}
          title="Ещё фильтры"
          count={count}
          onReset={() => set({ duration: undefined, min_experience: undefined, gender: undefined, language: undefined, intro: undefined })}
        >
          {durations.length > 1 && (
            <Section title="Длительность созвона">
              <Chips
                label="Длительность"
                options={durations.map((d) => ({ value: d, label: durationLabel(d) }))}
                isOn={(v) => value.duration === v}
                onToggle={(v) => set({ duration: value.duration === v ? undefined : v })}
              />
            </Section>
          )}
          <Section title="Опыт">
            <Chips
              label="Опыт"
              options={EXPERIENCE.map((y) => ({ value: y, label: fromYearsLabel(y) }))}
              isOn={(v) => value.min_experience === v}
              onToggle={(v) => set({ min_experience: value.min_experience === v ? undefined : v })}
            />
          </Section>
          {(facets?.genders.length ?? 0) > 1 && (
            <Section title="Специалист">
              <Chips
                label="Пол специалиста"
                options={facets!.genders.map((g) => ({ value: g.value, label: GENDER_LABEL[g.value] }))}
                isOn={(v) => value.gender === v}
                onToggle={(v) => set({ gender: value.gender === v ? undefined : v })}
              />
            </Section>
          )}
          {languages.length > 1 && (
            <Section title="Язык">
              <Chips
                label="Язык"
                options={languages.map((l) => ({ value: l.label, label: l.label }))}
                isOn={(v) => value.language === v}
                onToggle={(v) => set({ language: value.language === v ? undefined : v })}
              />
            </Section>
          )}
          {(facets?.intro ?? 0) > 0 && (
            <Section title="Знакомство">
              <Chips
                label="Знакомство"
                options={[{ value: "intro", label: "Есть знакомство 15\u00a0мин" }]}
                isOn={() => !!value.intro}
                onToggle={() => set({ intro: value.intro ? undefined : true })}
              />
            </Section>
          )}
        </FilterPopover>

        {showSort && (
          <span className={s.sort}>
            <Select<SortOrder>
              size="sm"
              className={s.sortSelect}
              aria-label="Сортировка"
              icon={<ArrowDownUp {...ic} />}
              value={SORTS.some((x) => x.value === value.sort) ? value.sort! : "relevance"}
              options={SORTS}
              onChange={(v) => set({ sort: v === "relevance" ? undefined : v })}
            />
          </span>
        )}
      </div>

      {chips.length > 0 && (
        <div className={s.active} aria-label="Выбранные фильтры">
          {chips.map((c) => (
            <button key={c.key} type="button" className={s.activeChip} onClick={c.clear} aria-label={`Убрать: ${c.label}`}>
              {c.label}
              <X size={13} strokeWidth={2.4} aria-hidden />
            </button>
          ))}
          {chips.length > 1 && (
            <button type="button" className={s.resetAll} onClick={resetAll}>
              Сбросить всё
            </button>
          )}
        </div>
      )}
    </div>
  );
}
