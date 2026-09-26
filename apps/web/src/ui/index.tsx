"use client";

/**
 * aprosop UI kit. Import from "@/ui". Tokens-only styling (ui.module.css).
 * Icons come from lucide-react at 20px / stroke 1.8.
 */
import Link from "next/link";
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";
import { X } from "lucide-react";
import s from "./ui.module.css";

const cx = (...c: unknown[]) => c.filter((x) => typeof x === "string" && x).join(" ");

// ── Button ────────────────────────────────────────────────────────────────────

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "white" | "soft";
export type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  /** Render as a Next link */
  href?: string;
  /** Icon-only button: pass aria-label! */
  iconOnly?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", block, loading, icon, href, iconOnly, className, children, disabled, ...rest },
  ref,
) {
  const cls = cx(s.btn, s[variant], s[size], block && s.block, iconOnly && s.iconOnly, className);
  const content = (
    <>
      {loading ? <span className={s.spinner} aria-hidden /> : icon}
      {children}
    </>
  );
  if (href && !disabled) {
    return (
      <Link href={href} className={cls} aria-label={rest["aria-label"]}>
        {content}
      </Link>
    );
  }
  return (
    <button ref={ref} className={cls} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {content}
    </button>
  );
});

// ── Card / Panel ──────────────────────────────────────────────────────────────

interface CardProps {
  children: ReactNode;
  className?: string;
  /** default = tier 2 content block; minor = tier 3 side info (quieter, compact); accent = tier 1 brand surface */
  tone?: "default" | "raised" | "accent" | "minor";
  onClick?: () => void;
  as?: "div" | "section" | "article";
  padded?: boolean;
  style?: React.CSSProperties;
}

export function Card({ children, className, tone = "default", onClick, as: Tag = "div", padded = true, style }: CardProps) {
  return (
    <Tag
      className={cx(
        s.card,
        tone === "raised" && s.cardRaised,
        tone === "accent" && s.cardAccent,
        tone === "minor" && s.cardMinor,
        onClick && s.cardInteractive,
        className,
      )}
      style={padded ? style : { padding: 0, ...style }}
      onClick={onClick}
    >
      {children}
    </Tag>
  );
}

export function CardHead({ title, sub, icon, action }: { title: ReactNode; sub?: ReactNode; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className={s.cardHead}>
      <div>
        <div className={s.cardTitle}>
          {icon}
          {title}
        </div>
        {sub && <div className={s.cardSub}>{sub}</div>}
      </div>
      {action}
    </div>
  );
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx(s.panel, className)}>{children}</div>;
}

// ── Quick action (pastel circle) ──────────────────────────────────────────────

export type Pastel = "peach" | "butter" | "lime" | "mint" | "lilac" | "sky" | "periwinkle" | "coral" | "cyan";

export function QuickAction({
  icon,
  label,
  tone,
  href,
  onClick,
}: {
  icon: ReactNode;
  label: ReactNode;
  tone: Pastel;
  href?: string;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <span className={cx(s.quickCircle, s[tone])} aria-hidden>
        {icon}
      </span>
      <span>{label}</span>
    </>
  );
  if (href)
    return (
      <Link href={href} className={s.quick}>
        {inner}
      </Link>
    );
  return (
    <button type="button" className={s.quick} onClick={onClick}>
      {inner}
    </button>
  );
}

// ── Form controls ─────────────────────────────────────────────────────────────

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className={s.field}>
      {label && (
        <label className={s.label} htmlFor={htmlFor}>
          {label}
        </label>
      )}
      {children}
      {error ? <div className={s.error} role="alert">{error}</div> : hint ? <div className={s.hint}>{hint}</div> : null}
    </div>
  );
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ label, hint, error, className, id, ...rest }, ref) {
  const auto = useId();
  const inputId = id ?? auto;
  const el = <input ref={ref} id={inputId} className={cx(s.input, error && s.inputInvalid, className)} aria-invalid={!!error || undefined} {...rest} />;
  if (!label && !hint && !error) return el;
  return (
    <Field label={label} hint={hint} error={error} htmlFor={inputId}>
      {el}
    </Field>
  );
});

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, className, id, ...rest },
  ref,
) {
  const auto = useId();
  const tid = id ?? auto;
  return (
    <Field label={label} hint={hint} error={error} htmlFor={tid}>
      <textarea ref={ref} id={tid} className={cx(s.input, error && s.inputInvalid, className)} {...rest} />
    </Field>
  );
});

// ── Segmented control ─────────────────────────────────────────────────────────

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  ariaLabel?: string;
}) {
  return (
    <div className={s.segmented} role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <button key={o.value} type="button" className={s.segment} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── Badge ─────────────────────────────────────────────────────────────────────

export function Badge({
  children,
  tone = "neutral",
  dot,
}: {
  children: ReactNode;
  /** sun / coral / cyan / lilac / mint: playful non-semantic accents (topics, tags, categories). */
  tone?: "neutral" | "success" | "warning" | "danger" | "primary" | "sun" | "coral" | "cyan" | "lilac" | "mint";
  dot?: boolean;
}) {
  return <span className={cx(s.badge, tone !== "neutral" && s[`tone-${tone}`], dot && s.badgeDot)}>{children}</span>;
}

// ── Stat tile ─────────────────────────────────────────────────────────────────

export function Stat({
  label,
  value,
  note,
  tone,
}: {
  label: ReactNode;
  value: ReactNode;
  note?: ReactNode;
  tone?: "danger" | "warning" | "success";
}) {
  return (
    <div className={s.stat}>
      <div className={s.statLabel}>{label}</div>
      <div
        className={cx(
          s.statValue,
          tone === "danger" && s.valueDanger,
          tone === "warning" && s.valueWarning,
          tone === "success" && s.valueSuccess,
        )}
      >
        {value}
      </div>
      {note && <div className={s.statNote}>{note}</div>}
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

export function EmptyState({
  icon,
  art,
  title,
  text,
  action,
}: {
  icon?: ReactNode;
  /** An illustration (components/illustrations); shown instead of the icon circle. */
  art?: ReactNode;
  title: ReactNode;
  text?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={s.empty}>
      {art ? <div className={s.emptyArt}>{art}</div> : icon && <div className={s.emptyIcon}>{icon}</div>}
      <div className={s.emptyTitle}>{title}</div>
      {text && <p style={{ maxWidth: 420 }}>{text}</p>}
      {action}
    </div>
  );
}

// ── Spinner / Skeleton ────────────────────────────────────────────────────────

export function Spinner({ label = "Загрузка" }: { label?: string }) {
  return <span className={s.spinner} role="status" aria-label={label} />;
}

export function Skeleton({ width = "100%", height = 16, radius }: { width?: number | string; height?: number | string; radius?: number }) {
  return <div className={s.skeleton} style={{ width, height, borderRadius: radius }} aria-hidden />;
}

// ── Modal ─────────────────────────────────────────────────────────────────────

export function Modal({
  open,
  onClose,
  title,
  children,
  width,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  width?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Keep the latest onClose without re-running the effect: callers pass inline
  // functions, and re-running it on every render stole focus while typing.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCloseRef.current();
    document.addEventListener("keydown", onKey);
    // Focus the first field in the body (not the close button in the header).
    const t = setTimeout(() => {
      const root = ref.current;
      if (!root || root.contains(document.activeElement)) return;
      const field = root.querySelector<HTMLElement>("input:not([type=hidden]),textarea,select");
      const body = Array.from(root.querySelectorAll<HTMLElement>("button,[tabindex]:not([tabindex='-1'])")).find(
        (el) => !el.closest("[data-modal-head]"),
      );
      (field ?? body ?? root.querySelector<HTMLElement>("button"))?.focus();
    }, 20);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, [open]);
  if (!open) return null;
  return (
    <div className={s.overlay} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className={s.modal} role="dialog" aria-modal="true" style={width ? { width: `min(${width}px, 100%)` } : undefined}>
        <div className={s.modalHead} data-modal-head>
          <h3>{title}</h3>
          <Button variant="ghost" size="sm" iconOnly aria-label="Закрыть" onClick={onClose} icon={<X size={18} />} />
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Toast ─────────────────────────────────────────────────────────────────────

interface ToastItem {
  id: number;
  text: ReactNode;
  error?: boolean;
}
const ToastCtx = createContext<(text: ReactNode, opts?: { error?: boolean }) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((text: ReactNode, opts?: { error?: boolean }) => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs, { id, text, error: opts?.error }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 3600);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className={s.toasts} aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={cx(s.toast, t.error && s.toastError)}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

// ── Select (styled listbox; replaces native <select>) ─────────────────────────

export { Select } from "./Select";
export type { SelectOption, SelectProps } from "./Select";
export { CollapsibleCard } from "./Collapsible";
