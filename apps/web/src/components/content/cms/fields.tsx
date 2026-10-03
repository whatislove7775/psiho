"use client";

import { t } from "@/lib/i18n";
import type { ReactNode } from "react";
import { Field, Select as UiSelect } from "@/ui";
import { COVERS, type Cover } from "@/lib/api/content";
import c from "../content.module.css";
import s from "./cms.module.css";

const COVER_LABEL: Record<Cover, string> = {
  get peach() { return t("Персик"); },
  get butter() { return t("Масло"); },
  get lime() { return t("Лайм"); },
  get mint() { return t("Мята"); },
  get lilac() { return t("Сирень"); },
  get sky() { return t("Небо"); },
};

export function CoverPicker({ value, onChange, error }: { value: Cover; onChange: (c: Cover) => void; error?: ReactNode }) {
  return (
    <Field label={t("Цвет обложки")} error={error}>
      <div className={s.swatches} role="radiogroup" aria-label={t("Цвет обложки")}>
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
  return <UiSelect label={label} error={error} value={value} onChange={onChange} options={options} />;
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
