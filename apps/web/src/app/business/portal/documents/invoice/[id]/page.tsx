"use client";

import { Skeleton } from "@/ui";
import { useLoad } from "@/components/client/useLoad";
import { ErrorBlock } from "@/components/client/ClientBits";
import { Paper } from "@/components/business/Paper";
import { businessApi, dateRu } from "@/lib/api/business";
import { rubK } from "@/lib/api/billing";
import s from "@/components/business/business.module.css";

export default function InvoicePage({ params }: { params: { id: string } }) {
  const docs = useLoad(() => businessApi.documents(), []);
  if (docs.error) return <ErrorBlock message={docs.error} onRetry={docs.reload} />;
  if (!docs.data) return <Skeleton height={480} radius={22} />;
  const inv = docs.data.invoices.find((i) => i.id === params.id);
  if (!inv) return <ErrorBlock message="Счёт не найден." onRetry={docs.reload} />;
  const c = docs.data.company;
  const req = docs.data.requisites;
  return (
    <Paper>
      <h2>Счёт на оплату № {inv.number}</h2>
      <div>от {dateRu(inv.created_at, { day: "numeric", month: "long", year: "numeric" })}</div>
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
            <th>№</th>
            <th>Наименование</th>
            <th className={s.num}>Сумма</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>1</td>
            <td>Предоплата программы психологической поддержки сотрудников (пополнение бюджета)</td>
            <td className={s.num}>{rubK(inv.amount_kopecks, { cents: true })}</td>
          </tr>
        </tbody>
      </table>
      <div>
        <strong>Итого: {rubK(inv.amount_kopecks, { cents: true })}</strong>, без НДС (заглушка).
      </div>
      <div>Статус: {inv.status_label.toLowerCase()}</div>
      <div className={s.paperStamp}>
        Образец. Реквизиты, банковские данные и подпись появятся после оформления юрлица. Документ сформирован автоматически.
      </div>
    </Paper>
  );
}
