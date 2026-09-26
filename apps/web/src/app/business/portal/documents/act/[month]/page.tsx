"use client";

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
  if (!act) return <ErrorBlock message="Акт за этот месяц не найден." onRetry={docs.reload} />;
  const c = docs.data.company;
  const req = docs.data.requisites;
  const k = docs.data.k_min;
  return (
    <Paper>
      <h2>Акт оказанных услуг за {act.label}</h2>
      <div className={s.paperMeta}>
        <span>Исполнитель</span>
        <span>
          {req.name}, ИНН {req.inn}
        </span>
        <span>Заказчик</span>
        <span>
          {c.legal_name || c.name}
          {c.inn ? `, ИНН ${c.inn}` : ""}
        </span>
        <span>Основание</span>
        <span>{c.contract_number ? `Договор № ${c.contract_number}` : "Договор (заглушка)"}</span>
      </div>
      <table>
        <thead>
          <tr>
            <th>Услуга</th>
            <th className={s.num}>Количество</th>
            <th className={s.num}>Сумма</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Психологическая поддержка сотрудников за {act.label}</td>
            <td className={s.num}>{act.calls !== null ? `${act.calls} созв.` : `скрыто (менее ${k} чел.)`}</td>
            <td className={s.num}>{rubK(act.amount_kopecks, { cents: true })}</td>
          </tr>
        </tbody>
      </table>
      <div>
        <strong>Итого: {rubK(act.amount_kopecks, { cents: true })}</strong>, списано из предоплаченного бюджета.
      </div>
      <div className={s.paperStamp}>
        Образец. Акт не содержит данных о сотрудниках: услуги оказаны анонимно, количество показывается только при {k} и более
        участниках. Реквизиты и подпись появятся после оформления юрлица.
      </div>
    </Paper>
  );
}
