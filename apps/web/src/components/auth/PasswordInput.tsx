"use client";

import { useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Field } from "@/ui";
import ui from "@/ui/ui.module.css";
import s from "./auth.module.css";

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
}

/** Password field with a show/hide toggle. */
export function PasswordInput({ label, hint, error, id, className, ...rest }: Props) {
  const auto = useId();
  const inputId = id ?? auto;
  const hintId = `${inputId}-hint`;
  const [shown, setShown] = useState(false);
  return (
    <Field label={label} hint={hint && <span id={hintId}>{hint}</span>} error={error} htmlFor={inputId}>
      <div className={s.pwWrap}>
        <input
          id={inputId}
          type={shown ? "text" : "password"}
          className={[ui.input, s.pwInput, error ? ui.inputInvalid : "", className].filter(Boolean).join(" ")}
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
          aria-label={shown ? "Скрыть пароль" : "Показать пароль"}
          aria-pressed={shown}
          aria-controls={inputId}
        >
          {shown ? <EyeOff size={20} strokeWidth={1.8} /> : <Eye size={20} strokeWidth={1.8} />}
        </button>
      </div>
    </Field>
  );
}
