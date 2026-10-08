"use client";
import { t, lp } from "@/lib/i18n";
import { psychologistsApi } from "@/lib/api/endpoints";
import { useLoad } from "@/components/client/useLoad";
import { ErrorBlock } from "@/components/client/ClientBits";
import { Card, Button, Skeleton } from "@/ui";
import { rub } from "@/lib/format";
import s from "./couples.module.css";
export function CoupleSpecialists() {
  const data = useLoad(() => psychologistsApi.list(), []);
  const list = data.data?.filter((p) => p.booking?.couples?.enabled);
  return (
    <div className={s.stack}>
      <h2>{t("Психологи, которые принимают пары")}</h2>
      {data.error && <ErrorBlock message={data.error} onRetry={data.reload} />}
      {data.loading && !data.data && <Skeleton height={180} />}
      {list?.length === 0 && (
        <div className={s.emptySpecialists}>
          <p>
            {t(
              "Пока никто из специалистов не открыл запись для пары. Можно обсудить этот формат со специалистом в личном диалоге.",
            )}
          </p>
          <Button href={lp("/specialists")} variant="ghost">
            {t("Посмотреть специалистов")}
          </Button>
        </div>
      )}
      <div className={s.list}>
        {list?.map((p) => (
          <Card key={p.id} className={s.card}>
            <h3>{p.display_name}</h3>
            <p>
              {p.booking!.couples!.minutes} {t("мин")},{" "}
              {rub(p.booking!.couples!.price_rub)} — {t("за всю встречу")}
            </p>
            <Button
              variant="primary"
              href={lp(`/specialists/${p.id}?session_format=couple#booking`)}
            >
              {t("Выбрать время")}
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
