"use client";

import { t, tj } from "@/lib/i18n";
import { Skeleton } from "@/ui";
import { useLoad } from "@/components/client/useLoad";
import { ErrorBlock } from "@/components/client/ClientBits";
import { Paper } from "@/components/business/Paper";
import { businessApi } from "@/lib/api/business";
import { rubK } from "@/lib/api/billing";
import s from "@/components/business/business.module.css";

export default function ActPage({ params }: { params: { month: string } }) {
  const docs = useLoad(() => businessApi.documents(), []);
  if (docs.error) return <ErrorBlock message={docs.error} onRetry={docs.reload} />;
  if (!docs.data) return <Skeleton height={480} radius={22} />;
  const act = docs.data.acts.find((a) => a.month === params.month);
  if (!act) return <ErrorBlock message={t("Акт за\u00a0этот месяц не\u00a0найден.")} onRetry={docs.reload} />;
  const c = docs.data.company;
  const req = docs.data.requisites;
  const k = docs.data.k_min;
  return (
    <Paper>
      <h2>{tj("Акт оказанных услуг за {label}", { label: act.label })}</h2>
      <div className={s.paperMeta}>
        <span>{t("Исполнитель")}</span>
        <span>
          {tj("{name}, ИНН {inn}", { name: req.name, inn: req.inn })}
        </span>
        <span>{t("Заказчик")}</span>
        <span>
          {c.legal_name || c.name}
          {c.inn ? t(`, ИНН {inn}`, { inn: c.inn }) : ""}
        </span>
        <span>{t("Основание")}</span>
        <span>{c.contract_number ? t(`Договор № {contract_number}`, { contract_number: c.contract_number }) : t("Договор (заглушка)")}</span>
      </div>
      <table>
        <thead>
          <tr>
            <th>{t("Услуга")}</th>
            <th className={s.num}>{t("Количество")}</th>
            <th className={s.num}>{t("Сумма")}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{tj("Психологическая поддержка сотрудников за {label}", { label: act.label })}</td>
            <td className={s.num}>{act.calls !== null ? t(`{calls} созв.`, { calls: act.calls }) : t(`скрыто (менее {k} чел.)`, { k })}</td>
            <td className={s.num}>{rubK(act.amount_kopecks, { cents: true })}</td>
          </tr>
        </tbody>
      </table>
      <div>
        <strong>{tj("Итого: {rubK}", { rubK: rubK(act.amount_kopecks, { cents: true }) })}</strong>{t(", списано из\u00a0предоплаченного бюджета.")}
      </div>
      <div className={s.paperStamp}>
        {tj("Образец. Акт не\u00a0содержит данных о\u00a0сотрудниках: услуги оказаны анонимно, количество показывается только при {k} и\u00a0более участниках. Реквизиты и\u00a0подпись появятся после оформления юрлица.", { k })}
      </div>
    </Paper>
  );
}
