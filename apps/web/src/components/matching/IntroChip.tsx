import { t } from "@/lib/i18n";
import { Handshake } from "lucide-react";
import { Badge } from "@/ui";
import type { PsychologistPublic } from "@/lib/api/types";
import { rub } from "@/lib/format";

/** Small chip «Знакомство 15 мин» for specialists who offer a short first call (H1). */
export function IntroChip({ psy, withPrice = false }: { psy: Pick<PsychologistPublic, "booking">; withPrice?: boolean }) {
  const intro = psy.booking?.intro;
  if (!intro?.enabled) return null;
  const price = intro.price_rub ? rub(intro.price_rub) : t("бесплатно");
  return (
    <span title={t(`Можно начать с\u00a0короткого знакомства: {minutes} мин, {price}`, { minutes: intro.minutes, price })}>
      <Badge tone="mint">
        <Handshake size={13} strokeWidth={2} aria-hidden />{" "}{t("Знакомство")}{" "}{intro.minutes}{" "}{t("мин")}{withPrice ? `, ${price}` : ""}
      </Badge>
    </span>
  );
}
