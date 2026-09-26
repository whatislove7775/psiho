import { Button } from "@/ui";
import s from "./public.module.css";

/** Quiet invitation to start anonymously — the conversion point of public content pages. */
export function StartCta({
  title = "Хочется обсудить это с кем-то?",
  text = "Без почты и телефона, с аватаром вместо лица.",
  compact,
}: {
  title?: string;
  text?: string;
  compact?: boolean;
}) {
  return (
    <aside className={s.cta} data-compact={compact || undefined} aria-label="Начать анонимно">
      <div className={s.ctaText}>
        <p className={s.ctaTitle}>{title}</p>
        {text && <p>{text}</p>}
      </div>
      <Button href="/start" variant="primary" size={compact ? "sm" : "md"}>
        Начать анонимно
      </Button>
    </aside>
  );
}
