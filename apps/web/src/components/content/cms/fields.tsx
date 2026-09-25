"use client";

import { useId, type ReactNode } from "react";
import { Field } from "@/ui";
import { COVERS, type Cover } from "@/lib/api/content";
import c from "../content.module.css";
import s from "./cms.module.css";

const COVER_LABEL: Record<Cover, string> = {
  peach: "Персик",
  butter: "Масло",
  lime: "Лайм",
  mint: "Мята",
  lilac: "Сирень",
  sky: "Небо",
};

export function CoverPicker({ value, onChange, error }: { value: Cover; onChange: (c: Cover) => void; error?: ReactNode }) {
  return (
    <Field label="Цвет обложки" error={error}>
      <div className={s.swatches} role="radiogroup" aria-label="Цвет обложки">
        {COVERS.map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={value === k}
            aria-label={COVER_LABEL[k]}
            title={COVER_LABEL[k]}
            className={`${s.swatch} ${c.tone}`}
            data-tone={k}
            onClick={() => onChange(k)}
          />
        ))}
      </div>
    </Field>
  );
}

export function Select({
  label,
  value,
  onChange,
  options,
  error,
}: {
  label: ReactNode;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  error?: ReactNode;
}) {
  const id = useId();
  return (
    <Field label={label} error={error} htmlFor={id}>
      <select id={id} className={s.select} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function Switch({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode }) {
  return (
    <label className={s.switchRow}>
      <span>
        <strong>{label}</strong>
        {hint && <span>{hint}</span>}
      </span>
      <input type="checkbox" role="switch" className={s.switch} checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

/** First error message for a field from an ApiError.fields map. */
export function fieldError(fields: Record<string, string[]>, key: string): string | undefined {
  return fields[key]?.[0];
}
