"use client";

/**
 * Styled replacement for the native <select>: a button that opens a listbox popover.
 * - Keyboard: ↑/↓/Enter/Space/Alt+↓ open; in the list ↑/↓, Home/End, PageUp/PageDown, typeahead,
 *   Enter/Space pick, Esc/Tab close. Focus stays on the list (aria-activedescendant).
 * - Pointer: click to open, click an option to pick, click outside to close.
 * - Narrow screens (≤ 560px): the list becomes a bottom sheet with large touch targets.
 * The popover is portalled to <body> with fixed positioning, so cards with overflow:hidden never clip it.
 */
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { Field } from "./index";
import s from "./Select.module.css";

export interface SelectOption<T extends string | number> {
  value: T;
  label: ReactNode;
  /** plain text for typeahead / the trigger when label is not a string */
  text?: string;
  /** secondary line under the label */
  hint?: ReactNode;
  disabled?: boolean;
}

export interface SelectProps<T extends string | number> {
  value: T;
  onChange: (v: T) => void;
  options: SelectOption<T>[];
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  id?: string;
  "aria-label"?: string;
  placeholder?: ReactNode;
  disabled?: boolean;
  size?: "sm" | "md";
  className?: string;
  /** Leading icon in the trigger */
  icon?: ReactNode;
}

const cx = (...c: unknown[]) => c.filter((x) => typeof x === "string" && x).join(" ");

function optText<T extends string | number>(o: SelectOption<T>): string {
  if (o.text) return o.text;
  return typeof o.label === "string" || typeof o.label === "number" ? String(o.label) : String(o.value);
}

export function Select<T extends string | number>({
  value,
  onChange,
  options,
  label,
  hint,
  error,
  id,
  "aria-label": ariaLabel,
  placeholder = "Выберите",
  disabled,
  size = "md",
  className,
  icon,
}: SelectProps<T>) {
  const auto = useId();
  const triggerId = id ?? `sel${auto}`;
  const listId = `${triggerId}-list`;
  const labelId = `${triggerId}-label`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; maxH: number; up: boolean } | null>(null);
  const typed = useRef({ q: "", t: 0 });

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight;
    const below = vh - r.bottom - 12;
    const above = r.top - 12;
    const want = Math.min(320, options.length * 44 + 12);
    const up = below < Math.min(want, 220) && above > below;
    setPos({
      top: up ? r.top - 6 : r.bottom + 6,
      left: Math.max(8, Math.min(r.left, window.innerWidth - Math.max(r.width, 200) - 8)),
      width: Math.max(r.width, 200),
      maxH: Math.max(160, Math.min(320, up ? above : below)),
      up,
    });
  }, [options.length]);

  const openList = (at?: number) => {
    if (disabled) return;
    place();
    setActive(at ?? (selectedIndex >= 0 ? selectedIndex : firstEnabled(options, 0, 1)));
    setOpen(true);
  };
  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus({ preventScroll: true });
  };
  const pick = (i: number) => {
    const o = options[i];
    if (!o || o.disabled) return;
    if (o.value !== value) onChange(o.value);
    close();
  };

  // Focus the list when it opens; keep it placed while the page scrolls/resizes.
  useLayoutEffect(() => {
    if (!open) return;
    listRef.current?.focus({ preventScroll: true });
    const onMove = () => place();
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (listRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      close(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
      document.removeEventListener("pointerdown", onDown, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, place]);

  // Keep the active option in view.
  useEffect(() => {
    if (!open || active < 0) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const typeahead = (key: string) => {
    const now = Date.now();
    typed.current.q = now - typed.current.t > 700 ? key : typed.current.q + key;
    typed.current.t = now;
    const q = typed.current.q.toLowerCase();
    const start = open ? active : selectedIndex;
    for (let k = 1; k <= options.length; k++) {
      const i = (Math.max(start, 0) + (q.length > 1 ? k - 1 : k)) % options.length;
      if (!options[i].disabled && optText(options[i]).toLowerCase().startsWith(q)) return i;
    }
    return -1;
  };

  const onTriggerKey = (e: ReactKeyboardEvent) => {
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
      e.preventDefault();
      openList();
    } else if (e.key.length === 1 && /\S/.test(e.key)) {
      const i = typeahead(e.key);
      if (i >= 0 && options[i].value !== value) onChange(options[i].value);
    }
  };

  const onListKey = (e: ReactKeyboardEvent) => {
    const n = options.length;
    const move = (from: number, dir: 1 | -1) => {
      const i = firstEnabled(options, from, dir);
      if (i >= 0) setActive(i);
    };
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        move(Math.min(active + 1, n - 1), 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        if (e.altKey) return pick(active);
        move(Math.max(active - 1, 0), -1);
        break;
      case "Home":
        e.preventDefault();
        move(0, 1);
        break;
      case "End":
        e.preventDefault();
        move(n - 1, -1);
        break;
      case "PageDown":
        e.preventDefault();
        move(Math.min(active + 6, n - 1), 1);
        break;
      case "PageUp":
        e.preventDefault();
        move(Math.max(active - 6, 0), -1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        pick(active);
        break;
      case "Escape":
        e.preventDefault();
        e.stopPropagation(); // don't close a surrounding modal
        close();
        break;
      case "Tab":
        close(false);
        break;
      default:
        if (e.key.length === 1 && /\S/.test(e.key)) {
          const i = typeahead(e.key);
          if (i >= 0) setActive(i);
        }
    }
  };

  const trigger = (
    <button
      ref={triggerRef}
      id={triggerId}
      type="button"
      className={cx(s.trigger, size === "sm" && s.sm, error && s.invalid, className)}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={open ? listId : undefined}
      aria-label={ariaLabel}
      aria-labelledby={!ariaLabel && label ? `${labelId} ${triggerId}` : undefined}
      aria-invalid={!!error || undefined}
      disabled={disabled}
      onClick={() => (open ? close() : openList())}
      onKeyDown={onTriggerKey}
    >
      {icon && <span className={s.icon}>{icon}</span>}
      <span className={cx(s.value, !selected && s.placeholder)}>{selected ? selected.label : placeholder}</span>
      <ChevronDown size={18} strokeWidth={2} className={s.chevron} aria-hidden />
    </button>
  );

  const popover =
    open && pos && typeof document !== "undefined"
      ? createPortal(
          <>
            <div className={s.scrim} aria-hidden onPointerDown={() => close(false)} />
            <ul
              ref={listRef}
              id={listId}
              role="listbox"
              tabIndex={-1}
              aria-labelledby={label ? labelId : undefined}
              aria-label={!label ? ariaLabel : undefined}
              aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
              className={cx(s.list, pos.up && s.up)}
              style={{
                top: pos.up ? undefined : pos.top,
                bottom: pos.up ? window.innerHeight - pos.top : undefined,
                left: pos.left,
                minWidth: pos.width,
                maxHeight: pos.maxH,
              }}
              onKeyDown={onListKey}
            >
              {options.map((o, i) => (
                <li
                  key={String(o.value)}
                  id={`${listId}-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={o.value === value}
                  aria-disabled={o.disabled || undefined}
                  className={cx(s.option, i === active && s.active)}
                  onPointerEnter={() => !o.disabled && setActive(i)}
                  onClick={() => pick(i)}
                >
                  <span className={s.optBody}>
                    <span>{o.label}</span>
                    {o.hint && <span className={s.optHint}>{o.hint}</span>}
                  </span>
                  {o.value === value && <Check size={18} strokeWidth={2.2} className={s.check} aria-hidden />}
                </li>
              ))}
            </ul>
          </>,
          document.body,
        )
      : null;

  if (!label && !hint && !error)
    return (
      <>
        {trigger}
        {popover}
      </>
    );
  return (
    <Field
      label={label ? <span id={labelId}>{label}</span> : undefined}
      hint={hint}
      error={error}
      htmlFor={triggerId}
    >
      {trigger}
      {popover}
    </Field>
  );
}

function firstEnabled<T extends string | number>(options: SelectOption<T>[], from: number, dir: 1 | -1): number {
  for (let i = from; i >= 0 && i < options.length; i += dir) if (!options[i].disabled) return i;
  return -1;
}
