"use client";

/**
 * Free-text input with suggestions while typing (e.g. «Вуз» from a list of universities).
 * The typed text is always the value — a suggestion only fills it in.
 * - Keyboard: ↓/↑ move (↓ also opens), Enter picks the highlighted suggestion, Esc closes, Tab leaves.
 * - Matching ignores case and ё/е; word-start matches come first; the matched part is highlighted.
 * - The list is portalled to <body> (fixed), so modals/cards never clip or shift it; on phones it stays
 *   under the field (the on-screen keyboard is up) and flips above when there is no room.
 */
import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { Portal } from "./Portal";
import { Field } from "./index";
import s from "./Combobox.module.css";

type NativeProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "list">;

export interface ComboboxProps extends NativeProps {
  value: string;
  onChange: (value: string) => void;
  /** all suggestions; filtered by the typed text */
  options: readonly string[];
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** max suggestions shown (default 8) */
  limit?: number;
  /** characters typed before suggestions appear (default 2) */
  minChars?: number;
}

const cx = (...c: unknown[]) => c.filter((x) => typeof x === "string" && x).join(" ");
export const normalize = (t: string) => t.toLowerCase().replace(/ё/g, "е").replace(/[«»"()]/g, "").replace(/\s+/g, " ").trim();

export function suggest(options: readonly string[], query: string, limit = 8): string[] {
  const q = normalize(query);
  if (!q) return [];
  const words = q.split(" ");
  const scored: { o: string; score: number }[] = [];
  for (const o of options) {
    const n = normalize(o);
    if (n === q) continue; // already typed in full
    // every typed word must occur; a match at a word start ranks higher
    let score = 0;
    let ok = true;
    for (const w of words) {
      const i = n.indexOf(w);
      if (i < 0) {
        ok = false;
        break;
      }
      const start = i === 0 || n[i - 1] === " " || n[i - 1] === "-";
      const end = i + w.length === n.length || n[i + w.length] === " ";
      // whole word (e.g. an abbreviation «мгу») < word start < inside a word
      score += start && end ? 0 : start ? 1 : 3;
    }
    // branches and former names after the main entry
    if (ok) scored.push({ o, score: (score + (/филиал|бывш|прежн/.test(n) ? 2 : 0)) * 1000 + n.length });
  }
  return scored
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map((x) => x.o);
}

function Highlight({ text, query }: { text: string; query: string }) {
  const q = normalize(query).split(" ")[0];
  if (!q) return <>{text}</>;
  const i = text.toLowerCase().replace(/ё/g, "е").indexOf(q);
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className={s.mark}>{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

export const Combobox = forwardRef<HTMLInputElement, ComboboxProps>(function Combobox(
  { value, onChange, options, label, hint, error, limit = 8, minChars = 2, id, className, onKeyDown, onBlur, onFocus, disabled, ...rest },
  fwd,
) {
  const auto = useId();
  const inputId = id ?? `cb${auto}`;
  const listId = `${inputId}-list`;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; maxH: number; up: boolean } | null>(null);

  const items = useMemo(
    () => (value.trim().length >= minChars ? suggest(options, value, limit) : []),
    [options, value, limit, minChars],
  );
  const shown = open && items.length > 0 && !disabled;

  const place = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vh = window.visualViewport?.height ?? window.innerHeight;
    const below = vh - r.bottom - 8;
    const above = r.top - 8;
    const up = below < 180 && above > below;
    setPos({
      top: up ? r.top - 6 : r.bottom + 6,
      left: r.left,
      width: r.width,
      maxH: Math.max(140, Math.min(340, up ? above : below)),
      up,
    });
  }, []);

  useLayoutEffect(() => {
    if (!shown) return;
    place();
    const onMove = () => place();
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    window.visualViewport?.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
      window.visualViewport?.removeEventListener("resize", onMove);
    };
  }, [shown, place]);

  useEffect(() => setActive(-1), [value]);
  useEffect(() => {
    if (!shown || active < 0) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [shown, active]);

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
    inputRef.current?.focus({ preventScroll: true });
  };

  const input = (
    <input
      ref={(el) => {
        inputRef.current = el;
        if (typeof fwd === "function") fwd(el);
        else if (fwd) fwd.current = el;
      }}
      id={inputId}
      type="text"
      role="combobox"
      autoComplete="off"
      aria-autocomplete="list"
      aria-expanded={shown}
      aria-controls={shown ? listId : undefined}
      aria-activedescendant={shown && active >= 0 ? `${listId}-${active}` : undefined}
      aria-invalid={!!error || undefined}
      className={cx(s.input, error && s.invalid, className)}
      value={value}
      disabled={disabled}
      onChange={(e) => {
        onChange(e.target.value);
        setOpen(true);
      }}
      onFocus={(e) => {
        setOpen(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setOpen(false);
        onBlur?.(e);
      }}
      onKeyDown={(e) => {
        onKeyDown?.(e);
        if (e.defaultPrevented) return;
        if (e.key === "ArrowDown") {
          e.preventDefault();
          if (!open) setOpen(true);
          else if (items.length) setActive((a) => (a + 1) % items.length);
        } else if (e.key === "ArrowUp" && shown) {
          e.preventDefault();
          setActive((a) => (a <= 0 ? items.length - 1 : a - 1));
        } else if (e.key === "Enter" && shown && active >= 0) {
          e.preventDefault();
          pick(items[active]);
        } else if (e.key === "Escape" && shown) {
          e.preventDefault();
          e.stopPropagation(); // don't close a surrounding modal
          setOpen(false);
        }
      }}
      {...rest}
    />
  );

  const list =
    shown && pos ? (
      <Portal>
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label="Подсказки"
          className={cx(s.list, pos.up && s.up)}
          style={{
            top: pos.up ? undefined : pos.top,
            bottom: pos.up ? window.innerHeight - pos.top : undefined,
            left: pos.left,
            width: pos.width,
            maxHeight: pos.maxH,
          }}
          // keep focus in the field while tapping a suggestion
          onPointerDown={(e) => e.preventDefault()}
          onMouseDown={(e) => e.preventDefault()}
        >
          {items.map((o, i) => (
            <li
              key={o}
              id={`${listId}-${i}`}
              data-index={i}
              role="option"
              aria-selected={i === active}
              className={cx(s.option, i === active && s.active)}
              onPointerEnter={() => setActive(i)}
              onClick={() => pick(o)}
            >
              <Highlight text={o} query={value} />
            </li>
          ))}
        </ul>
      </Portal>
    ) : null;

  if (!label && !hint && !error)
    return (
      <>
        {input}
        {list}
      </>
    );
  return (
    <Field label={label} hint={hint} error={error} htmlFor={inputId}>
      {input}
      {list}
    </Field>
  );
});
