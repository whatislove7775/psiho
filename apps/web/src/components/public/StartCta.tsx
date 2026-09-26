import { ShieldCheck } from "lucide-react";
import { Button } from "@/ui";
import s from "./public.module.css";

/** Invitation to start anonymously — the conversion point of every public content page. */
export function StartCta({
  title = "Хочется обсудить это с кем-то?",
  text = "Специалист поможет разобраться именно в вашей ситуации. Без почты и телефона, по видео с аватаром вместо лица или в чате.",
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
        <p>{text}</p>
      </div>
      <div className={s.ctaActions}>
        <Button href="/start" variant="white">
          Начать анонимно
        </Button>
        <span className={s.ctaNote}>
          <ShieldCheck size={14} strokeWidth={2} aria-hidden />
          Нужен только пароль
        </span>
      </div>
    </aside>
  );
}
