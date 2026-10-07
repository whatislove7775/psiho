import { t, lp } from "@/lib/i18n";
import { SiteHeader } from "@/components/landing/SiteHeader";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { CoupleSpecialists } from "@/components/couples/CoupleSpecialists";
import { Card, Button } from "@/ui";
import l from "@/components/landing/landing.module.css";
import s from "@/components/couples/couples.module.css";
export function generateMetadata() {
  return {
    title: t("Консультации для пары"),
    description: t(
      "Два партнёра и психолог в закрытой встрече. Отдельные аккаунты, аватары и одна цена за двоих.",
    ),
  };
}
export default function Page() {
  return (
    <div className={l.page}>
      <SiteHeader />
      <main className={`${l.wrap} ${l.section} ${s.page}`}>
        <h1>{t("Поговорить с психологом вдвоём")}</h1>
        <p>
          {t(
            "Для партнёров и семейных пар: обсудить отношения, повторяющиеся конфликты и договорённости. Каждый входит со своего устройства под псевдонимом и с аватаром.",
          )}
        </p>
        <Card className={s.stack}>
          <h2>{t("Как проходит встреча для пары")}</h2>
          <ol>
            <li>
              {t(
                "Выберите специалиста, который принимает пары, и удобное время.",
              )}
            </li>
            <li>
              {t(
                "Один партнёр оплачивает встречу целиком и передаёт второму личное приглашение.",
              )}
            </li>
            <li>
              {t(
                "Второй партнёр входит со своего аккаунта и добровольно подтверждает участие.",
              )}
            </li>
            <li>
              {t(
                "В назначенное время вы оба и психолог входите в закрытую комнату.",
              )}
            </li>
          </ol>
          <p className={s.note}>
            {t(
              "Личные диалоги партнёров не объединяются. Мы не записываем созвоны. Если вы вместе в одной комнате, используйте наушники или одно устройство для звука, чтобы избежать эха.",
            )}
          </p>
        </Card>
        <CoupleSpecialists />
        <Card className={s.stack}>
          <h2>{t("Участие должно быть добровольным")}</h2>
          <p>
            {t(
              "Если вы боитесь партнёра или не можете свободно отказаться, сначала обратитесь к специалисту индивидуально. Не пересылайте приглашение под давлением.",
            )}
          </p>
          <Button href={lp("/specialists")} variant="secondary">
            {t("Выбрать индивидуальную консультацию")}
          </Button>
        </Card>
      </main>
      <SiteFooter />
    </div>
  );
}
