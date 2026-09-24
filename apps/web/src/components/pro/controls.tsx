"use client";

import { useState, type KeyboardEvent } from "react";
import { Plus, RotateCw, X } from "lucide-react";
import { Button, Input } from "@/ui";
import s from "./pro.module.css";

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={s.switch}
      onClick={() => onChange(!checked)}
    />
  );
}

/** Editable list of tags: current chips, a free-text input and optional suggestions. */
export function ChipsField({
  value,
  onChange,
  suggestions = [],
  placeholder,
  addLabel,
  max = 12,
  inputId,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
  addLabel: string;
  max?: number;
  inputId?: string;
}) {
  const [draft, setDraft] = useState("");
  const has = (t: string) => value.some((v) => v.toLowerCase() === t.toLowerCase());
  const add = (raw: string) => {
    const t = raw.trim().replace(/\s+/g, " ");
    if (!t || has(t) || value.length >= max) return;
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
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {value.length > 0 && (
        <div className={s.chips}>
          {value.map((t) => (
            <span key={t} className={s.chip}>
              {t}
              <button type="button" aria-label={`Убрать «${t}»`} onClick={() => remove(t)}>
                <X size={14} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className={s.chipInput}>
        <Input
          id={inputId}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          placeholder={value.length >= max ? `Можно указать до ${max}` : placeholder}
          disabled={value.length >= max}
          maxLength={40}
        />
        <Button
          type="button"
          variant="secondary"
          disabled={!draft.trim() || value.length >= max}
          onClick={() => {
            add(draft);
            setDraft("");
          }}
        >
          {addLabel}
        </Button>
      </div>
      {rest.length > 0 && value.length < max && (
        <div className={s.chips} aria-label="Подсказки">
          {rest.map((t) => (
            <button key={t} type="button" className={s.suggest} onClick={() => add(t)}>
              <Plus size={14} aria-hidden />
              {t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function LoadError({ text, onRetry }: { text: string; onRetry: () => void }) {
  return (
    <div className={s.errorBox} role="alert">
      <span>{text}</span>
      <Button size="sm" variant="secondary" icon={<RotateCw size={16} />} onClick={onRetry}>
        Повторить
      </Button>
    </div>
  );
}
