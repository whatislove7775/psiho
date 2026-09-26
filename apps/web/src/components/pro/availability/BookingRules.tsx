"use client";

import { Card, CardHead, Field, Input, Segmented, Select } from "@/ui";
import { durationLabel, priceFor, type AvailabilitySettings } from "@/lib/api/availability";
import { plural, rub } from "@/lib/format";
import c from "./availability.module.css";

export type RulesDraft = Pick<
  AvailabilitySettings,
  | "time_zone"
  | "min_duration"
  | "max_duration"
  | "durations"
  | "buffer_minutes"
  | "min_notice_minutes"
  | "horizon_days"
  | "start_step_minutes"
  | "hourly_rate_rub"
  | "intro_enabled"
  | "intro_price_rub"
>;

const BUFFERS = [0, 10, 15, 30, 60];
const ZONES: [string, string][] = [
  ["Europe/Kaliningrad", "Калининград"],
  ["Europe/Moscow", "Москва"],
  ["Europe/Samara", "Самара"],
  ["Asia/Yekaterinburg", "Екатеринбург"],
  ["Asia/Omsk", "Омск"],
  ["Asia/Novosibirsk", "Новосибирск"],
  ["Asia/Krasnoyarsk", "Красноярск"],
  ["Asia/Irkutsk", "Иркутск"],
  ["Asia/Yakutsk", "Якутск"],
  ["Asia/Vladivostok", "Владивосток"],
  ["Asia/Magadan", "Магадан"],
  ["Asia/Kamchatka", "Камчатка"],
];

export function utcOffset(zone: string): string {
  try {
    const part = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "shortOffset" })
      .formatToParts(new Date())
      .find((p) => p.type === "timeZoneName")?.value;
    return (part ?? "GMT").replace("GMT", "UTC").replace(/^UTC$/, "UTC+0");
  } catch {
    return "";
  }
}

export function zoneName(zone: string): string {
  return ZONES.find(([z]) => z === zone)?.[1] ?? zone.split("/").pop()?.replace(/_/g, " ") ?? zone;
}

const noticeLabel = (m: number) =>
  m % 1440 === 0 ? (m === 1440 ? "за сутки" : `за ${m / 1440} суток`) : `за ${m / 60} ${m / 60 === 1 ? "час" : m / 60 < 5 ? "часа" : "часов"}`;
const horizonLabel = (d: number) => (d % 7 === 0 ? `${d / 7} ${d / 7 === 1 ? "неделю" : d / 7 < 5 ? "недели" : "недель"}` : `${d} дней`);

/** Session length options, buffer, notice, horizon, start step, time zone. */
export function SessionRules({
  draft,
  options,
  onChange,
}: {
  draft: RulesDraft;
  options: AvailabilitySettings["options"];
  onChange: (patch: Partial<RulesDraft>) => void;
}) {
  const all = options.durations;
  const inRange = all.filter((d) => d >= draft.min_duration && d <= draft.max_duration);
  const chosen = inRange.filter((d) => draft.durations.includes(d));
  const toggle = (d: number) => {
    const on = draft.durations.includes(d);
    if (on && chosen.length <= 1) return; // хотя бы одна длительность
    onChange({ durations: on ? draft.durations.filter((x) => x !== d) : [...draft.durations, d].sort((a, b) => a - b) });
  };
  const setMin = (v: number) => {
    const patch: Partial<RulesDraft> = { min_duration: v, max_duration: Math.max(v, draft.max_duration) };
    if (!draft.durations.some((d) => d >= v && d <= patch.max_duration!)) patch.durations = [...draft.durations, v];
    onChange(patch);
  };
  const setMax = (v: number) => {
    const patch: Partial<RulesDraft> = { max_duration: v, min_duration: Math.min(v, draft.min_duration) };
    if (!draft.durations.some((d) => d >= patch.min_duration! && d <= v)) patch.durations = [...draft.durations, v];
    onChange(patch);
  };
  const buffers = BUFFERS.includes(draft.buffer_minutes) ? BUFFERS : [...BUFFERS, draft.buffer_minutes].sort((a, b) => a - b);
  const zones = ZONES.some(([z]) => z === draft.time_zone) ? ZONES : [[draft.time_zone, zoneName(draft.time_zone)] as [string, string], ...ZONES];

  return (
    <Card as="section">
      <CardHead title="Сессии и запись" sub="Клиент выбирает длительность при записи и видит только подходящее свободное время" />
      <div className={c.rules}>
        <div className={c.rule}>
          <div className={c.ruleText}>
            <strong>Длительность созвона</strong>
            <span>
              {chosen.length === 1
                ? `Только ${durationLabel(chosen[0])}`
                : `От ${durationLabel(chosen[0])} до ${durationLabel(chosen[chosen.length - 1])}, ${chosen.length} ${plural(
                    chosen.length,
                    "вариант",
                    "варианта",
                    "вариантов",
                  )} на выбор`}
            </span>
          </div>
          <div className={c.durLimits}>
            <div>
              <span>Самая короткая</span>
              <Select aria-label="Самая короткая" className={c.selectBox} value={draft.min_duration} onChange={setMin} options={all.map((d) => ({ value: d, label: durationLabel(d) }))} />
            </div>
            <div>
              <span>Самая длинная</span>
              <Select aria-label="Самая длинная" className={c.selectBox} value={draft.max_duration} onChange={setMax} options={all.map((d) => ({ value: d, label: durationLabel(d) }))} />
            </div>
          </div>
          <div className={c.durChips} role="group" aria-label="Варианты длительности для клиента">
            {all.map((d) => {
              const available = d >= draft.min_duration && d <= draft.max_duration;
              const on = available && draft.durations.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  className={c.durChip}
                  aria-pressed={on}
                  disabled={!available}
                  onClick={() => toggle(d)}
                  title={available ? undefined : "Вне выбранных пределов"}
                >
                  {durationLabel(d)}
                </button>
              );
            })}
          </div>
        </div>

        <div className={c.rule}>
          <div className={c.ruleText}>
            <strong>Перерыв между созвонами</strong>
            <span>Время на отдых и заметки. Следующую запись система поставит не раньше</span>
          </div>
          <Segmented<string>
            ariaLabel="Перерыв между созвонами"
            value={String(draft.buffer_minutes)}
            onChange={(v) => onChange({ buffer_minutes: Number(v) })}
            options={buffers.map((b) => ({ value: String(b), label: b ? `${b} мин` : "Без перерыва" }))}
          />
        </div>

        <div className={c.ruleGrid}>
          <Field label="Запись не позднее чем" htmlFor="rule-notice" hint="Чтобы не было неожиданных созвонов через полчаса">
            <Select
              id="rule-notice"
              className={c.selectBox}
              value={draft.min_notice_minutes}
              onChange={(v) => onChange({ min_notice_minutes: v })}
              options={uniq([...options.min_notice_minutes, draft.min_notice_minutes]).map((m) => ({ value: m, label: `${noticeLabel(m)} до начала` }))}
            />
          </Field>
          <Field label="Открывать запись на" htmlFor="rule-horizon" hint="Насколько вперёд клиенты видят свободное время">
            <Select
              id="rule-horizon"
              className={c.selectBox}
              value={draft.horizon_days}
              onChange={(v) => onChange({ horizon_days: v })}
              options={uniq([...options.horizon_days, draft.horizon_days]).map((d) => ({ value: d, label: `${horizonLabel(d)} вперёд` }))}
            />
          </Field>
          <Field label="Созвоны начинаются" htmlFor="rule-step" hint="А ещё сразу после другого созвона и перерыва">
            <Select
              id="rule-step"
              className={c.selectBox}
              value={draft.start_step_minutes}
              onChange={(v) => onChange({ start_step_minutes: v })}
              options={options.start_step_minutes.map((m) => ({
                value: m,
                label: m === 60 ? "В начале каждого часа" : m === 30 ? "Каждые полчаса" : `Каждые ${m} минут`,
              }))}
            />
          </Field>
          <Field label="Ваш часовой пояс" htmlFor="rule-tz" hint="Расписание задаётся в нём, клиенты видят своё время">
            <Select
              id="rule-tz"
              className={c.selectBox}
              value={draft.time_zone}
              onChange={(v) => onChange({ time_zone: v })}
              options={zones.map(([z, name]) => ({ value: z, label: `${name}, ${utcOffset(z)}` }))}
            />
          </Field>
        </div>
      </div>
    </Card>
  );
}

/** Hourly rate and resulting prices for each offered duration. */
export function PriceCard({
  draft,
  feePercent,
  error,
  onChange,
}: {
  draft: RulesDraft;
  feePercent: number;
  error: string | null;
  onChange: (patch: Partial<RulesDraft>) => void;
}) {
  const offered = draft.durations.filter((d) => d >= draft.min_duration && d <= draft.max_duration);
  const fee = feePercent / 100;
  return (
    <Card as="section">
      <CardHead
        title="Стоимость"
        sub="Цена указывается за час. Сессия стоит пропорционально длительности, сумма округляется до 10 ₽"
      />
      <div className={c.price}>
        <div className={c.priceInput}>
          <Input
            label="Цена часа, ₽"
            inputMode="numeric"
            value={Number.isFinite(draft.hourly_rate_rub) && draft.hourly_rate_rub ? String(draft.hourly_rate_rub) : ""}
            onChange={(e) => onChange({ hourly_rate_rub: Number(e.target.value.replace(/\D/g, "").slice(0, 6)) || 0 })}
            error={error ?? undefined}
            hint={`Комиссия платформы ${feePercent}%`}
          />
        </div>
        <ul className={c.priceList} aria-label="Цены для клиента">
          {offered.map((d) => {
            const p = priceFor(draft.hourly_rate_rub || 0, d);
            return (
              <li key={d}>
                <span>{durationLabel(d)}</span>
                <strong>{rub(p)}</strong>
                <small>вам {rub(p * (1 - fee))}</small>
              </li>
            );
          })}
        </ul>
      </div>
    </Card>
  );
}

/** H1: «Знакомство, 15 минут» — optional short first call with its own small fixed price (or free). Off by default. */
export function IntroCard({
  draft,
  maxPrice,
  error,
  onChange,
}: {
  draft: RulesDraft;
  maxPrice: number;
  error: string | null;
  onChange: (patch: Partial<RulesDraft>) => void;
}) {
  const mode = !draft.intro_enabled ? "off" : draft.intro_price_rub ? "paid" : "free";
  return (
    <Card as="section" tone="minor">
      <CardHead
        title="Знакомство, 15 минут"
        sub="Короткий первый созвон, чтобы клиент понял, комфортно ли ему с вами. Один раз на клиента"
      />
      <div className={c.rules}>
        <Segmented<string>
          ariaLabel="Знакомство"
          value={mode}
          onChange={(v) =>
            onChange(
              v === "off"
                ? { intro_enabled: false }
                : v === "free"
                  ? { intro_enabled: true, intro_price_rub: 0 }
                  : { intro_enabled: true, intro_price_rub: draft.intro_price_rub || 500 },
            )
          }
          options={[
            { value: "off", label: "Не провожу" },
            { value: "free", label: "Бесплатно" },
            { value: "paid", label: "Платно" },
          ]}
        />
        {mode === "paid" && (
          <div className={c.priceInput}>
            <Input
              label="Цена знакомства, ₽"
              inputMode="numeric"
              value={draft.intro_price_rub ? String(draft.intro_price_rub) : ""}
              onChange={(e) => onChange({ intro_price_rub: Number(e.target.value.replace(/\D/g, "").slice(0, 5)) || 0 })}
              error={error ?? undefined}
              hint={`До ${rub(maxPrice)}. Время берётся из вашего расписания`}
            />
          </div>
        )}
      </div>
    </Card>
  );
}

function uniq(xs: number[]) {
  return Array.from(new Set(xs)).sort((a, b) => a - b);
}
