"use client";

/** Specialist: create / edit a circle. After publication only the text, rules and room settings can change. */
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
      } else setFormError("Не\u00a0получилось сохранить. Проверьте интернет.");
    }
  };

  return (
    <div className={s.form}>
      {live && <p className={s.note}>Круг опубликован: тему, расписание, места и&nbsp;цену изменить нельзя&nbsp;— на&nbsp;них уже записываются люди.</p>}
      <div className={s.formRow}>
        <Select<CircleTopic>
          label="Тема"
          value={f.topic}
          onChange={(v) => set("topic", v)}
          disabled={live}
          options={(Object.keys(TOPIC_LABEL) as CircleTopic[]).map((t) => ({ value: t, label: TOPIC_LABEL[t] }))}
        />
        <Input label="Название" value={f.title} maxLength={120} disabled={live} onChange={(e) => set("title", e.target.value)} error={err("title")} placeholder="Например, «Тревога без&nbsp;стыда»" />
      </div>
      <Textarea
        label="О&nbsp;чём круг"
        rows={5}
        value={f.description}
        maxLength={3000}
        onChange={(e) => set("description", e.target.value)}
        error={err("description")}
        hint="Для&nbsp;кого круг, о&nbsp;чём будете говорить, чем&nbsp;он&nbsp;поможет. Простыми словами, от&nbsp;40&nbsp;символов."
      />
      <Textarea
        label="Правила круга"
        rows={5}
        value={f.rules}
        maxLength={2000}
        onChange={(e) => set("rules", e.target.value)}
        error={err("rules")}
        hint="Каждое правило&nbsp;— с&nbsp;новой строки. Участники видят их&nbsp;до&nbsp;записи."
      />
      <div className={s.formRow}>
        <div>
          <div className={s.note} style={{ marginBottom: 6, fontWeight: 600, color: "var(--c-text)" }}>
            Формат
          </div>
          <Segmented
            ariaLabel="Формат"
            value={f.format}
            onChange={(v) => !live && set("format", v)}
            options={[
              { value: "series", label: "Цикл встреч" },
              { value: "single", label: "Одна встреча" },
            ]}
          />
        </div>
        {f.format === "series" && (
          <Select<number>
            label="Сколько встреч"
            value={f.meetings_count}
            disabled={live}
            onChange={(v) => set("meetings_count", v)}
            options={Array.from({ length: 11 }, (_, i) => i + 2).map((n) => ({ value: n, label: `${n} ${plural(n, "встреча", "встречи", "встреч")}, раз в\u00a0неделю` }))}
          />
        )}
      </div>
      <div className={s.formRow}>
        <Input
          label={f.format === "series" ? "Первая встреча" : "Дата и\u00a0время"}
          type="datetime-local"
          value={f.first_meeting_at}
          disabled={live}
          onChange={(e) => set("first_meeting_at", e.target.value)}
          error={err("first_meeting_at")}
          hint="Не&nbsp;раньше чем&nbsp;через сутки: круг сначала проверяет команда Aprosop"
        />
        <Select<number>
          label="Длительность встречи"
          value={f.meeting_minutes}
          disabled={live}
          onChange={(v) => set("meeting_minutes", v)}
          options={[60, 75, 90, 120].map((m) => ({ value: m, label: `${m} минут` }))}
        />
        <Select<number>
          label="Мест в&nbsp;круге"
          value={f.capacity}
          disabled={live}
          onChange={(v) => set("capacity", v)}
          options={[5, 6, 7, 8, 9, 10, 11, 12].map((n) => ({ value: n, label: `${n} участников` }))}
          hint="Плюс вы и&nbsp;ко-терапевт. Больше 12&nbsp;— уже не&nbsp;круг"
        />
      </div>
      <div className={s.formRow}>
        {f.format === "series" && (
          <div>
            <div className={s.note} style={{ marginBottom: 6, fontWeight: 600, color: "var(--c-text)" }}>
              Оплата
            </div>
            <Segmented
              ariaLabel="Как&nbsp;платят участники"
              value={f.billing}
              onChange={(v) => !live && set("billing", v)}
              options={[
                { value: "per_meeting", label: "За\u00a0встречу" },
                { value: "series", label: "За\u00a0весь цикл" },
              ]}
            />
          </div>
        )}
        <NumberInput
          label={f.billing === "series" && f.format === "series" ? "Цена за\u00a0цикл, ₽" : "Цена за\u00a0встречу, ₽"}
          min={300}
          max={60000}
          step={50}
          value={f.price_rub}
          disabled={live}
          onChange={(v) => set("price_rub", v ?? 0)}
          error={err("price_rub")}
          hint={`Участник заплатит ${total.toLocaleString("ru-RU")} ₽ за\u00a0${f.format === "single" ? "встречу" : "весь круг"}`}
        />
      </div>
      <div className={s.formRow}>
        <Select<CircleRetention>
          label="Сообщения в&nbsp;чате круга"
          value={f.chat_retention}
          onChange={(v) => set("chat_retention", v)}
          options={[
            { value: "forever", label: "Хранить, пока идёт круг" },
            { value: "24h", label: "Исчезают через сутки" },
            { value: "1h", label: "Исчезают через час" },
          ]}
        />
        <label className={s.toggle}>
          <input type="checkbox" checked={f.allow_real_faces} onChange={(e) => set("allow_real_faces", e.target.checked)} />
          <span>
            Разрешить участникам показывать лицо
            <small>По&nbsp;умолчанию все&nbsp;— только в&nbsp;аватарах. Если включить, каждый сам решает, показывать&nbsp;ли камеру.</small>
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
          {initial ? "Сохранить" : "Создать черновик"}
        </Button>
      </div>
    </div>
  );
}
