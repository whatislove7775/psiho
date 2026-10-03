"use client";

import { t } from "@/lib/i18n";
import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Field } from "./index";
import s from "./ui.module.css";

export interface PasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
}

/** Password field with a show/hide «eye» toggle. Use for every password input on the site. */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(function PasswordInput(
  { label, hint, error, id, className, ...rest },
  ref,
) {
  const auto = useId();
  const inputId = id ?? auto;
  const hintId = `${inputId}-hint`;
  const [shown, setShown] = useState(false);
  const el = (
    <div className={s.pwWrap}>
      <input
        ref={ref}
        id={inputId}
        type={shown ? "text" : "password"}
        className={[s.input, s.pwInput, error ? s.inputInvalid : "", className].filter(Boolean).join(" ")}
        aria-invalid={!!error || undefined}
        aria-describedby={hint && !error ? hintId : undefined}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        {...rest}
      />
      <button
        type="button"
        className={s.pwToggle}
        onClick={() => setShown((v) => !v)}
        aria-label={shown ? t("Скрыть пароль") : t("Показать пароль")}
        title={shown ? t("Скрыть пароль") : t("Показать пароль")}
        aria-pressed={shown}
        aria-controls={inputId}
      >
        {shown ? <EyeOff size={18} strokeWidth={1.8} /> : <Eye size={18} strokeWidth={1.8} />}
      </button>
    </div>
  );
  if (!label && !hint && !error) return el;
  return (
    <Field label={label} hint={hint && <span id={hintId}>{hint}</span>} error={error} htmlFor={inputId}>
      {el}
    </Field>
  );
});
