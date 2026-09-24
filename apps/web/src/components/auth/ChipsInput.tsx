"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { Plus, X } from "lucide-react";
import { Field } from "@/ui";
import s from "./auth.module.css";

/** Free-form tags with one-tap suggestions. Enter or comma adds a tag. */
export function ChipsInput({
  label,
  hint,
  error,
  value,
  onChange,
  suggestions = [],
  max = 8,
  placeholder = "Добавьте тему и нажмите Enter",
}: {
  label: string;
  hint?: string;
  error?: string;
  value: string[];
  onChange: (v: string[]) => void;
  suggestions?: string[];
  max?: number;
  placeholder?: string;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState("");
  const has = (t: string) => value.some((v) => v.toLowerCase() === t.toLowerCase());
  const full = value.length >= max;

  const add = (raw: string) => {
    const t = raw.trim().replace(/\s+/g, " ").slice(0, 40);
    if (!t || has(t) || full) return;
    onChange([...value, t.charAt(0).toUpperCase() + t.slice(1)]);
  };
  const remove = (t: string) => onChange(value.filter((v) => v !== t));

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(draft);
      setDraft("");
    } else if (e.key === "Backspace" && !draft && value.length) {
      remove(value[value.length - 1]);
    }
  };

  const rest = suggestions.filter((t) => !has(t));

  return (
    <Field label={label} hint={full ? `Можно выбрать до ${max} тем` : hint} error={error} htmlFor={id}>
      <div className={s.chipsBox} onClick={() => inputRef.current?.focus()}>
        {value.map((t) => (
          <span key={t} className={s.chip}>
            {t}
            <button type="button" onClick={() => remove(t)} aria-label={`Убрать тему «${t}»`}>
              <X size={14} strokeWidth={2} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          id={id}
          className={s.chipsInput}
          value={draft}
          disabled={full}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          onBlur={() => {
            if (draft.trim()) {
              add(draft);
              setDraft("");
            }
          }}
          placeholder={value.length ? "" : placeholder}
          aria-invalid={!!error || undefined}
        />
      </div>
      {rest.length > 0 && !full && (
        <div className={s.suggest} role="group" aria-label="Популярные темы">
          {rest.map((t) => (
            <button key={t} type="button" className={s.suggestBtn} onClick={() => add(t)}>
              <Plus size={14} strokeWidth={2} aria-hidden />
              {t}
            </button>
          ))}
        </div>
      )}
    </Field>
  );
}
