"use client";

import { t, tj } from "@/lib/i18n";
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
  if (!inv) return <ErrorBlock message={t("Счёт не\u00a0найден.")} onRetry={docs.reload} />;
  const c = docs.data.company;
  const req = docs.data.requisites;
  return (
    <Paper>
      <h2>{tj("Счёт на\u00a0оплату № {number}", { number: inv.number })}</h2>
      <div>{tj("от {dateRu}", { dateRu: dateRu(inv.created_at, { day: "numeric", month: "long", year: "numeric" }) })}</div>
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
            <th>№</th>
            <th>{t("Наименование")}</th>
            <th className={s.num}>{t("Сумма")}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>1</td>
            <td>{t("Предоплата программы психологической поддержки сотрудников (пополнение бюджета)")}</td>
            <td className={s.num}>{rubK(inv.amount_kopecks, { cents: true })}</td>
          </tr>
        </tbody>
      </table>
      <div>
        <strong>{tj("Итого: {rubK}", { rubK: rubK(inv.amount_kopecks, { cents: true }) })}</strong>{t(", без\u00a0НДС (заглушка).")}
      </div>
      <div>{tj("Статус: {v}", { v: inv.status_label.toLowerCase() })}</div>
      <div className={s.paperStamp}>
        {t("Образец. Реквизиты, банковские данные и\u00a0подпись появятся после оформления юрлица. Документ сформирован автоматически.")}
      </div>
    </Paper>
  );
}
