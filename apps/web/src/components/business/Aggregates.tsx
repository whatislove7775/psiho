"use client";

import { t, tj, intlLocale } from "@/lib/i18n";
import { rubK } from "@/lib/api/billing";
import type { MonthRow } from "@/lib/api/business";
import s from "./business.module.css";

/** A k-anonymous number: null → «менее k». */
export function Hidden({ value, k, suffix = "" }: { value: number | null; k: number; suffix?: string }) {
  if (value === null) return <span className={s.hidden} title={t(`Меньше {k} человек\u00a0— число скрыто`, { k })}>{tj("менее {k}", { k })}</span>;
  return (
    <>
      {value.toLocaleString(intlLocale())}
      {suffix}
    </>
  );
}

function cap(x: string) {
  return x.charAt(0).toUpperCase() + x.slice(1);
}

export function MonthlyTable({ rows, k }: { rows: MonthRow[]; k: number }) {
  return (
    <div className={s.tableWrap}>
      <table className={s.table}>
        <thead>
          <tr>
            <th scope="col">{t("Месяц")}</th>
            <th scope="col" className={s.num}>
              {t("Сотрудников")}
            </th>
            <th scope="col" className={s.num}>
              {t("Созвонов")}
            </th>
            <th scope="col" className={s.num}>
              {t("Часов")}
            </th>
            <th scope="col" className={s.num}>
              {t("Списано")}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.month}>
              <td>{cap(r.label)}</td>
              <td className={s.num}>
                <Hidden value={r.people} k={k} />
              </td>
              <td className={s.num}>
                <Hidden value={r.calls} k={k} />
              </td>
              <td className={s.num}>
                <Hidden value={r.hours} k={k} />
              </td>
              <td className={s.num}>{rubK(r.spent_kopecks)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
