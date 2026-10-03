import { t } from "@/lib/i18n";
import { lp } from "@/lib/i18n";
import { Button } from "@/ui";
import s from "./public.module.css";

/** Quiet invitation to start anonymously — the conversion point of public content pages. */
export function StartCta({
  title = t("Хочется обсудить это\u00a0с\u00a0кем-то?"),
  text = t("Без\u00a0почты и\u00a0телефона, с\u00a0аватаром вместо лица."),
  compact,
}: {
  title?: string;
  text?: string;
  compact?: boolean;
}) {
  return (
    <aside className={s.cta} data-compact={compact || undefined} aria-label={t("Начать анонимно")}>
      <div className={s.ctaText}>
        <p className={s.ctaTitle}>{title}</p>
        {text && <p>{text}</p>}
      </div>
      <Button href={lp("/start")} variant="primary" size={compact ? "sm" : "md"}>
        {t("Начать анонимно")}
      </Button>
    </aside>
  );
}
