"use client";

/** Specialist: create / edit a circle. After publication only the text, rules and room settings can change. */
import { t as tt, intlLocale } from "@/lib/i18n";
import { useMemo, useState } from "react";
import { Button, Input, NumberInput, Segmented, Select, Textarea } from "@/ui";
import { ApiError } from "@/lib/api/client";
import {
  TOPIC_LABEL,
  type CircleRetention,
  type CircleTopic,
  type CircleWrite,
  type OwnerCircle,
} from "@/lib/api/circles";
import { plural } from "@/lib/format";
import s from "./circles.module.css";

const DEFAULT_RULES = [
  "Всё, что\u00a0звучит в\u00a0круге, остаётся в\u00a0круге.",
  "Говорим о\u00a0себе, не\u00a0даём советов, если о\u00a0них не\u00a0просили.",
  "Не\u00a0пытаемся узнать, кто есть кто, и\u00a0не\u00a0делимся контактами.",
  "Можно просто слушать\u00a0— говорить не\u00a0обязательно.",
  "Не\u00a0записываем встречи и\u00a0не\u00a0делаем скриншоты.",
].join("\n");

function localInput(iso: string | null | undefined): string {
  const d = iso ? new Date(iso) : new Date(Date.now() + 4 * 86400000);
  if (!iso) d.setHours(19, 0, 0, 0);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function ProCircleForm({
  initial,
  onSave,
  saving,
}: {
  initial?: OwnerCircle | null;
  onSave: (body: CircleWrite | Partial<CircleWrite>) => Promise<void>;
  saving?: boolean;
}) {
  const live = !!initial && !initial.editable;
  const [f, setF] = useState<CircleWrite>(() => ({
    topic: initial?.topic ?? "anxiety",
    title: initial?.title ?? "",
    description: initial?.description ?? "",
    rules: initial?.rules_text || (initial ? "" : DEFAULT_RULES),
    format: initial?.format ?? "series",
    meeting_minutes: initial?.meeting_minutes ?? 90,
    capacity: initial?.capacity ?? 8,
    billing: initial?.billing ?? "per_meeting",
    price_rub: initial ? Math.round(initial.price_kopecks / 100) : 1000,
    first_meeting_at: localInput(initial?.meetings[0]?.starts_at),
    meetings_count: initial?.meetings.length ?? 6,
    allow_real_faces: initial?.allow_real_faces ?? false,
    chat_retention: initial?.chat_retention ?? "forever",
  }));
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const set = <K extends keyof CircleWrite>(k: K, v: CircleWrite[K]) => setF((x) => ({ ...x, [k]: v }));
  const err = (k: string) => errors[k]?.[0];

  const total = useMemo(() => {
    if (f.format === "single") return f.price_rub;
    return f.billing === "series" ? f.price_rub : f.price_rub * f.meetings_count;
  }, [f]);

  const submit = async () => {
    setErrors({});
    setFormError(null);
    try {
      if (live) {
        await onSave({ description: f.description, rules: f.rules, allow_real_faces: f.allow_real_faces, chat_retention: f.chat_retention });
      } else {
        await onSave({ ...f, first_meeting_at: new Date(f.first_meeting_at).toISOString() });
      }
    } catch (e) {
      if (e instanceof ApiError) {
        setErrors(e.fields);
        setFormError(e.message);
      } else setFormError(tt("Не\u00a0получилось сохранить. Проверьте интернет."));
    }
  };

  return (
    <div className={s.form}>
      {live && <p className={s.note}>{tt("Круг опубликован: тему, расписание, места и\u00a0цену изменить нельзя\u00a0— на\u00a0них уже записываются люди.")}</p>}
      <div className={s.formRow}>
        <Select<CircleTopic>
          label={tt("Тема")}
          value={f.topic}
          onChange={(v) => set("topic", v)}
          disabled={live}
          options={(Object.keys(TOPIC_LABEL) as CircleTopic[]).map((t) => ({ value: t, label: TOPIC_LABEL[t] }))}
        />
        <Input label={tt("Название")} value={f.title} maxLength={120} disabled={live} onChange={(e) => set("title", e.target.value)} error={err("title")} placeholder={tt("Например, «Тревога без\u00a0стыда»")} />
      </div>
      <Textarea
        label={tt("О\u00a0чём круг")}
        rows={5}
        value={f.description}
        maxLength={3000}
        onChange={(e) => set("description", e.target.value)}
        error={err("description")}
        hint={tt("Для\u00a0кого круг, о\u00a0чём будете говорить, чем\u00a0он\u00a0поможет. Простыми словами, от\u00a040\u00a0символов.")}
      />
      <Textarea
        label={tt("Правила круга")}
        rows={5}
        value={f.rules}
        maxLength={2000}
        onChange={(e) => set("rules", e.target.value)}
        error={err("rules")}
        hint={tt("Каждое правило\u00a0— с\u00a0новой строки. Участники видят их\u00a0до\u00a0записи.")}
      />
      <div className={s.formRow}>
        <div>
          <div className={s.note} style={{ marginBottom: 6, fontWeight: 600, color: "var(--c-text)" }}>
            {tt("Формат")}
          </div>
          <Segmented
            ariaLabel={tt("Формат")}
            value={f.format}
            onChange={(v) => !live && set("format", v)}
            options={[
              { value: "series", label: tt("Цикл встреч") },
              { value: "single", label: tt("Одна встреча") },
            ]}
          />
        </div>
        {f.format === "series" && (
          <Select<number>
            label={tt("Сколько встреч")}
            value={f.meetings_count}
            disabled={live}
            onChange={(v) => set("meetings_count", v)}
            options={Array.from({ length: 11 }, (_, i) => i + 2).map((n) => ({ value: n, label: tt(`{n} {plural}, раз в\u00a0неделю`, { n, plural: plural(n, "встреча", "встречи", "встреч") }) }))}
          />
        )}
      </div>
      <div className={s.formRow}>
        <Input
          label={f.format === "series" ? tt("Первая встреча") : tt("Дата и\u00a0время")}
          type="datetime-local"
          value={f.first_meeting_at}
          disabled={live}
          onChange={(e) => set("first_meeting_at", e.target.value)}
          error={err("first_meeting_at")}
          hint={tt("Не\u00a0раньше чем\u00a0через сутки: круг сначала проверяет команда Aprosop")}
        />
        <Select<number>
          label={tt("Длительность встречи")}
          value={f.meeting_minutes}
          disabled={live}
          onChange={(v) => set("meeting_minutes", v)}
          options={[60, 75, 90, 120].map((m) => ({ value: m, label: tt(`{m} минут`, { m }) }))}
        />
        <Select<number>
          label={tt("Мест в\u00a0круге")}
          value={f.capacity}
          disabled={live}
          onChange={(v) => set("capacity", v)}
          options={[5, 6, 7, 8, 9, 10, 11, 12].map((n) => ({ value: n, label: tt(`{n} участников`, { n }) }))}
          hint={tt("Плюс вы и\u00a0ко-терапевт. Больше 12\u00a0— уже не\u00a0круг")}
        />
      </div>
      <div className={s.formRow}>
        {f.format === "series" && (
          <div>
            <div className={s.note} style={{ marginBottom: 6, fontWeight: 600, color: "var(--c-text)" }}>
              {tt("Оплата")}
            </div>
            <Segmented
              ariaLabel={tt("Как\u00a0платят участники")}
              value={f.billing}
              onChange={(v) => !live && set("billing", v)}
              options={[
                { value: "per_meeting", label: tt("За\u00a0встречу") },
                { value: "series", label: tt("За\u00a0весь цикл") },
              ]}
            />
          </div>
        )}
        <NumberInput
          label={f.billing === "series" && f.format === "series" ? tt("Цена за\u00a0цикл, ₽") : tt("Цена за\u00a0встречу, ₽")}
          min={300}
          max={60000}
          step={50}
          value={f.price_rub}
          disabled={live}
          onChange={(v) => set("price_rub", v ?? 0)}
          error={err("price_rub")}
          hint={tt(`Участник заплатит {v} ₽ за\u00a0{v2}`, { v: total.toLocaleString(intlLocale()), v2: f.format === "single" ? tt("встречу") : tt("весь круг") })}
        />
      </div>
      <div className={s.formRow}>
        <Select<CircleRetention>
          label={tt("Сообщения в\u00a0чате круга")}
          value={f.chat_retention}
          onChange={(v) => set("chat_retention", v)}
          options={[
            { value: "forever", label: tt("Хранить, пока идёт круг") },
            { value: "24h", label: tt("Исчезают через сутки") },
            { value: "1h", label: tt("Исчезают через час") },
          ]}
        />
        <label className={s.toggle}>
          <input type="checkbox" checked={f.allow_real_faces} onChange={(e) => set("allow_real_faces", e.target.checked)} />
          <span>
            {tt("Разрешить участникам показывать лицо")}
            <small>{tt("По\u00a0умолчанию все\u00a0— только в\u00a0аватарах. Если включить, каждый сам решает, показывать\u00a0ли камеру.")}</small>
          </span>
        </label>
      </div>
      {formError && (
        <p className={s.note} role="alert" style={{ color: "var(--c-danger)" }}>
          {formError}
        </p>
      )}
      <div>
        <Button variant="primary" size="lg" loading={saving} onClick={submit}>
          {initial ? tt("Сохранить") : tt("Создать черновик")}
        </Button>
      </div>
    </div>
  );
}
