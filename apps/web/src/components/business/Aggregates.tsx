"use client";

import { rubK } from "@/lib/api/billing";
import type { MonthRow } from "@/lib/api/business";
import s from "./business.module.css";

/** A k-anonymous number: null → «менее k». */
export function Hidden({ value, k, suffix = "" }: { value: number | null; k: number; suffix?: string }) {
  if (value === null) return <span className={s.hidden} title={`Меньше ${k} человек — число скрыто`}>менее {k}</span>;
  return (
    <>
      {value.toLocaleString("ru-RU")}
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
            <th scope="col">Месяц</th>
            <th scope="col" className={s.num}>
              Сотрудников
            </th>
            <th scope="col" className={s.num}>
              Созвонов
            </th>
            <th scope="col" className={s.num}>
              Часов
            </th>
            <th scope="col" className={s.num}>
              Списано
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
