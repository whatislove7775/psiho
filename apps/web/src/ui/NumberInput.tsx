"use client";

/**
 * Styled number field: replaces <input type="number"> (whose native spinners are unstyled browser chrome).
 * - −/+ stepper buttons (press and hold to repeat), min/max/step, clamped on blur.
 * - Keyboard: ↑/↓ = step, Shift+↑/↓ or PageUp/PageDown = 10 steps, Home/End = min/max.
 * - Phones: numeric keypad via inputMode (decimal when step is fractional); comma is accepted as a separator.
 * Controlled by a number (null = empty); the typed text is kept while editing.
 */
import { t as tt } from "@/lib/i18n";
import { forwardRef, useEffect, useId, useRef, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Minus, Plus } from "lucide-react";
import { Field } from "./index";
import s from "./NumberInput.module.css";

type NativeProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type" | "min" | "max" | "step" | "size">;

export interface NumberInputProps extends NativeProps {
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** unit shown after the number inside the field, e.g. "₽" */
  suffix?: ReactNode;
}

const cx = (...c: unknown[]) => c.filter((x) => typeof x === "string" && x).join(" ");

function decimals(n: number) {
  const t = String(n);
  const i = t.indexOf(".");
  return i < 0 ? 0 : t.length - i - 1;
}

export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(function NumberInput(
  { value, onChange, min, max, step = 1, label, hint, error, suffix, id, className, disabled, readOnly, onBlur, onKeyDown, ...rest },
  ref,
) {
  const auto = useId();
  const inputId = id ?? auto;
  const fmt = (v: number | null | undefined) => (v == null || Number.isNaN(v) ? "" : String(v));
  const [text, setText] = useState(fmt(value));
  const hold = useRef<{ t?: ReturnType<typeof setTimeout>; i?: ReturnType<typeof setInterval> }>({});
  const latest = useRef(value);
  latest.current = value;

  // Follow outside changes, but keep the user's in-progress text ("1.", "-", "") when it parses to the same value.
  useEffect(() => {
    setText((t) => (parse(t) === (value ?? null) ? t : fmt(value)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  useEffect(() => () => stopHold(), []);

  const fractional = decimals(step) > 0 || (min != null && decimals(min) > 0);
  const allowNeg = min == null || min < 0;

  function parse(t: string): number | null {
    const n = parseFloat(t.replace(",", "."));
    return t.trim() === "" || Number.isNaN(n) ? null : n;
  }
  const clamp = (n: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
  const round = (n: number) => Number(n.toFixed(Math.max(decimals(step), min != null ? decimals(min) : 0)));

  const commit = (n: number | null) => {
    setText(fmt(n));
    if (n !== (latest.current ?? null)) onChange(n);
  };
  const bump = (dir: 1 | -1, mult = 1) => {
    const cur = latest.current;
    const base = cur == null || Number.isNaN(cur) ? (dir > 0 ? (min ?? 0) : (max ?? min ?? 0)) : cur;
    const next = clamp(round(cur == null ? base : base + dir * step * mult));
    latest.current = next;
    commit(next);
  };
  function stopHold() {
    clearTimeout(hold.current.t);
    clearInterval(hold.current.i);
  }
  const startHold = (dir: 1 | -1) => {
    bump(dir);
    stopHold();
    hold.current.t = setTimeout(() => (hold.current.i = setInterval(() => bump(dir), 70)), 380);
  };

  const cur = value ?? null;
  const atMin = min != null && cur != null && cur <= min;
  const atMax = max != null && cur != null && cur >= max;
  const locked = disabled || readOnly;

  const field = (
    <div className={cx(s.wrap, error && s.invalid, disabled && s.disabled, className)}>
      <input
        ref={ref}
        id={inputId}
        type="text"
        inputMode={fractional ? "decimal" : "numeric"}
        autoComplete="off"
        role="spinbutton"
        aria-valuenow={cur ?? undefined}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-invalid={!!error || undefined}
        className={s.input}
        value={text}
        disabled={disabled}
        readOnly={readOnly}
        onChange={(e) => {
          const pattern = fractional ? (allowNeg ? /^-?\d*[.,]?\d*$/ : /^\d*[.,]?\d*$/) : allowNeg ? /^-?\d*$/ : /^\d*$/;
          const t = e.target.value.replace(/\s/g, "");
          if (!pattern.test(t)) return;
          setText(t);
          const n = parse(t);
          if (n !== (value ?? null)) onChange(n);
        }}
        onBlur={(e) => {
          const n = parse(text);
          commit(n == null ? null : clamp(n));
          onBlur?.(e);
        }}
        onKeyDown={(e) => {
          onKeyDown?.(e);
          if (e.defaultPrevented || locked) return;
          const k = e.key;
          if (k === "ArrowUp" || k === "ArrowDown") {
            e.preventDefault();
            bump(k === "ArrowUp" ? 1 : -1, e.shiftKey ? 10 : 1);
          } else if (k === "PageUp" || k === "PageDown") {
            e.preventDefault();
            bump(k === "PageUp" ? 1 : -1, 10);
          } else if (k === "Home" && min != null) {
            e.preventDefault();
            commit(min);
          } else if (k === "End" && max != null) {
            e.preventDefault();
            commit(max);
          }
        }}
        {...rest}
      />
      {suffix && <span className={s.suffix} aria-hidden>{suffix}</span>}
      <span className={s.steps}>
        {(["-", "+"] as const).map((sign) => {
          const dir = sign === "+" ? 1 : -1;
          const off = locked || (dir < 0 ? atMin : atMax);
          return (
            <button
              key={sign}
              type="button"
              tabIndex={-1}
              className={s.step}
              aria-label={dir > 0 ? tt("Увеличить") : tt("Уменьшить")}
              aria-controls={inputId}
              disabled={off}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.preventDefault(); // keep focus (and the phone keyboard) where it is
                startHold(dir);
              }}
              onPointerUp={stopHold}
              onPointerLeave={stopHold}
              onPointerCancel={stopHold}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), bump(dir))}
            >
              {dir > 0 ? <Plus size={16} strokeWidth={2.2} /> : <Minus size={16} strokeWidth={2.2} />}
            </button>
          );
        })}
      </span>
    </div>
  );

  if (!label && !hint && !error) return field;
  return (
    <Field label={label} hint={hint} error={error} htmlFor={inputId}>
      {field}
    </Field>
  );
});
