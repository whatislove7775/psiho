"use client";

/**
 * Compact filter pills shared by the search palette and /app/specialists.
 * Every pill is the design-system <Select> (styled listbox, never a native <select>),
 * restyled as a pill; a set filter gets a soft accent and its own clear button.
 */
import type { ReactNode } from "react";
import { Banknote, Clock3, Handshake, GraduationCap, Hourglass, Languages, MessageCircleHeart, Sparkles, UserRound, X } from "lucide-react";
import { Select, type SelectOption } from "@/ui";
import { durationLabel } from "@/lib/api/availability";
import { plural } from "@/lib/format";
import type { GenderFilter, SearchFacets, SpecialistQuery, WhenFilter } from "@/lib/api/search";
import s from "./search.module.css";

const NONE = "__none"; // nothing chosen: the pill shows its name (placeholder)
const ANY = "__any"; // «Не важно» option: clears the filter

const WHEN: SelectOption<string>[] = [
  { value: "today", label: "Сегодня" },
  { value: "3days", label: "Ближайшие 3 дня" },
  { value: "evening", label: "Вечером", hint: "Начало после 18:00" },
  { value: "weekend", label: "В выходные" },
];

const EXPERIENCE: SelectOption<string>[] = [
  { value: "3", label: "Опыт от 3 лет" },
  { value: "5", label: "Опыт от 5 лет" },
  { value: "10", label: "Опыт от 10 лет" },
];

const GENDER_LABEL: Record<GenderFilter, string> = { female: "Женщина", male: "Мужчина" };

function priceSteps(f: SearchFacets | null): number[] {
  const all = [2500, 3000, 3500, 4000, 5000, 6000, 8000, 10000];
  if (!f || !f.price.max) return [3000, 4000, 5000];
  const steps = all.filter((x) => x >= f.price.min && x < f.price.max);
  return steps.length ? steps.slice(-5) : [f.price.max];
}

const nf = new Intl.NumberFormat("ru-RU");
const ic = { size: 15, strokeWidth: 1.9, "aria-hidden": true } as const;
const countHint = (n: number) => `${n} ${plural(n, "специалист", "специалиста", "специалистов")}`;

function Pill({
  name,
  icon,
  value,
  options,
  anyLabel,
  onChange,
}: {
  name: string;
  icon: ReactNode;
  value: string | undefined;
  options: SelectOption<string>[];
  anyLabel: string;
  onChange: (v: string | undefined) => void;
}) {
  const set = value !== undefined && value !== "";
  return (
    <span className={s.pillWrap} data-set={set ? "" : undefined}>
      <Select<string>
        size="sm"
        className={s.pillSelect}
        aria-label={name}
        placeholder={name}
        icon={icon}
        value={set ? value! : NONE}
        options={[{ value: ANY, label: anyLabel }, ...options]}
        onChange={(v) => onChange(v === ANY || v === NONE ? undefined : v)}
      />
      {set && (
        <button type="button" className={s.pillClear} aria-label={`Сбросить фильтр: ${name.toLowerCase()}`} onClick={() => onChange(undefined)}>
          <X size={13} strokeWidth={2.2} />
        </button>
      )}
    </span>
  );
}

export function FilterBar({
  value,
  onChange,
  facets,
  className,
}: {
  value: SpecialistQuery;
  onChange: (next: SpecialistQuery) => void;
  facets: SearchFacets | null;
  className?: string;
}) {
  const set = <K extends keyof SpecialistQuery>(k: K, v: SpecialistQuery[K]) => onChange({ ...value, [k]: v });
  const topics = (facets?.topics ?? []).filter((t) => !(value.topics ?? []).includes(t.label));
  const languages = facets?.languages ?? [];
  const durations = facets?.durations ?? [];
  const num = (v: string | undefined) => (v ? Number(v) : undefined);

  return (
    <div className={`${s.filters} ${className ?? ""}`} role="group" aria-label="Фильтры">
      {topics.length > 0 && (
        // «Запрос» adds a topic; chosen topics show as pressed chips above
        <span className={s.pillWrap}>
          <Select<string>
            size="sm"
            className={s.pillSelect}
            aria-label="Добавить запрос"
            placeholder="Запрос"
            icon={<MessageCircleHeart {...ic} />}
            value={NONE}
            options={topics.map((t) => ({ value: t.label, label: t.label, hint: countHint(t.count) }))}
            onChange={(v) => set("topics", [...(value.topics ?? []), v])}
          />
        </span>
      )}
      {(facets?.approaches.length ?? 0) > 0 && (
        <Pill
          name="Подход"
          icon={<Sparkles {...ic} />}
          anyLabel="Любой подход"
          options={facets!.approaches.map((a) => ({ value: a.value, label: a.label, hint: countHint(a.count) }))}
          value={value.approach}
          onChange={(v) => set("approach", v)}
        />
      )}
      <Pill name="Когда" icon={<Clock3 {...ic} />} anyLabel="Когда угодно" options={WHEN} value={value.when} onChange={(v) => set("when", v as WhenFilter | undefined)} />
      <Pill
        name="Цена"
        icon={<Banknote {...ic} />}
        anyLabel="Любая цена"
        options={priceSteps(facets).map((p) => ({ value: String(p), label: `До ${nf.format(p)} ₽` }))}
        value={value.max_rate ? String(value.max_rate) : undefined}
        onChange={(v) => set("max_rate", num(v))}
      />
      {durations.length > 1 && (
        <Pill
          name="Длительность"
          icon={<Hourglass {...ic} />}
          anyLabel="Любая длительность"
          options={durations.map((d) => ({ value: String(d), label: `Созвон ${durationLabel(d)}` }))}
          value={value.duration ? String(value.duration) : undefined}
          onChange={(v) => set("duration", num(v))}
        />
      )}
      <Pill
        name="Опыт"
        icon={<GraduationCap {...ic} />}
        anyLabel="Любой опыт"
        options={EXPERIENCE}
        value={value.min_experience ? String(value.min_experience) : undefined}
        onChange={(v) => set("min_experience", num(v))}
      />
      {(facets?.genders.length ?? 0) > 0 && (
        <Pill
          name="Пол"
          icon={<UserRound {...ic} />}
          anyLabel="Не важно"
          options={facets!.genders.map((g) => ({ value: g.value, label: GENDER_LABEL[g.value] }))}
          value={value.gender}
          onChange={(v) => set("gender", v as GenderFilter | undefined)}
        />
      )}
      {(facets?.intro ?? 0) > 0 && (
        // H1: «Знакомство, 15 минут» — a simple on/off pill
        <button
          type="button"
          className={s.pillToggle}
          aria-pressed={!!value.intro}
          title="Специалисты, у которых можно записаться на короткое знакомство"
          onClick={() => set("intro", value.intro ? undefined : true)}
        >
          <Handshake {...ic} />
          Знакомство 15 мин
          {value.intro && <X size={13} strokeWidth={2.2} aria-hidden />}
        </button>
      )}
      {languages.length > 1 && (
        <Pill
          name="Язык"
          icon={<Languages {...ic} />}
          anyLabel="Любой язык"
          options={languages.map((l) => ({ value: l.label, label: l.label, hint: countHint(l.count) }))}
          value={value.language}
          onChange={(v) => set("language", v)}
        />
      )}
    </div>
  );
}
