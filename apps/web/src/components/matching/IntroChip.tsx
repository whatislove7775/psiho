import { Handshake } from "lucide-react";
import { Badge } from "@/ui";
import type { PsychologistPublic } from "@/lib/api/types";
import { rub } from "@/lib/format";

/** Small chip «Знакомство 15 мин» for specialists who offer a short first call (H1). */
export function IntroChip({ psy, withPrice = false }: { psy: Pick<PsychologistPublic, "booking">; withPrice?: boolean }) {
  const intro = psy.booking?.intro;
  if (!intro?.enabled) return null;
  const price = intro.price_rub ? rub(intro.price_rub) : "бесплатно";
  return (
    <span title={`Можно начать с короткого знакомства: ${intro.minutes} мин, ${price}`}>
      <Badge tone="mint">
        <Handshake size={13} strokeWidth={2} aria-hidden /> Знакомство {intro.minutes} мин{withPrice ? `, ${price}` : ""}
      </Badge>
    </span>
  );
}
