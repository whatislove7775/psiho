"use client";
import { t } from "@/lib/i18n";
import { couplesApi } from "@/lib/api/couples";
import { useLoad } from "@/components/client/useLoad";
import { ErrorBlock } from "@/components/client/ClientBits";
import { Button, Card, Skeleton } from "@/ui";
import { dayLabel, time } from "@/lib/format";
import { rubK0 } from "@/lib/api/circles";
import s from "./couples.module.css";
import { coupleStatus } from "./status";
export function CouplesList({ pro = false }: { pro?: boolean }) {
  const data = useLoad(
    async () =>
      pro
        ? (await couplesApi.pro()).results
        : (await couplesApi.mine()).results,
    [pro],
  );
  return (
    <div className={s.page}>
      <h1>{t("Встречи для пары")}</h1>
      <p className={s.note}>
        {t(
          "Закрытая консультация двух партнёров с психологом. У каждого свой аккаунт и аватар.",
        )}
      </p>
      <Button href={pro ? "/pro/schedule" : "/couples"} variant="primary">
        {pro ? t("Настроить приём пар") : t("Выбрать психолога для пары")}
      </Button>
      {data.error && <ErrorBlock message={data.error} onRetry={data.reload} />}
      {data.loading && !data.data && <Skeleton height={180} />}
      {data.data?.length === 0 && (
        <Card>
          <p>{t("Встреч для пары пока нет.")}</p>
        </Card>
      )}
      <div className={s.list}>
        {data.data?.map((c) => (
          <Card key={c.id} className={s.card}>
            <h2>{c.host.name}</h2>
            <p>{coupleStatus(c.status)}</p>
            <p>
              {c.next_meeting_at
                ? `${dayLabel(c.next_meeting_at)}, ${time(c.next_meeting_at)}`
                : t("Встреча завершена")}
            </p>
            <p>
              {rubK0(c.price_kopecks)} — {t("за всю встречу")}
            </p>
            <Button
              href={`${pro ? "/pro" : "/app"}/couples/${c.id}`}
              variant="secondary"
            >
              {t("Открыть встречу")}
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
