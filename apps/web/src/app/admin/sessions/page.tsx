"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays } from "lucide-react";
import { Card, CardHead, EmptyState, Segmented, Skeleton } from "@/ui";
import { PageHeader } from "@/components/shell/AppShell";
import { SessionsTable } from "@/components/admin/SessionsTable";
import { LoadError } from "@/components/pro/controls";
import { adminApi } from "@/lib/api/endpoints";
import type { Session } from "@/lib/api/types";
import { plural, rub } from "@/lib/format";

type Filter = "all" | "active" | "completed" | "cancelled";
const MATCH: Record<Filter, (x: Session) => boolean> = {
  all: () => true,
  active: (x) => ["awaiting_payment", "paid", "in_progress"].includes(x.status),
  completed: (x) => x.status === "completed",
  cancelled: (x) => x.status === "cancelled" || x.status === "refunded",
};

export default function AdminSessions() {
  const [items, setItems] = useState<Session[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  const load = useCallback(() => {
    setError(null);
    adminApi
      .sessions()
      .then(setItems)
      .catch((e) => setError(`${(e as Error).message} Попробуйте обновить список.`));
  }, []);
  useEffect(load, [load]);

  const list = useMemo(() => (items ?? []).filter(MATCH[filter]), [items, filter]);
  const sum = list.filter((x) => x.status !== "cancelled" && x.status !== "refunded" && x.status !== "awaiting_payment").reduce((n, x) => n + x.amount_rub, 0);

  return (
    <>
      <PageHeader
        title="Сессии"
        sub="Последние 100 записей на платформе, новые сверху."
        action={
          <Segmented<Filter>
            ariaLabel="Фильтр по статусу"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "Все" },
              { value: "active", label: "Предстоящие" },
              { value: "completed", label: "Завершены" },
              { value: "cancelled", label: "Отменены" },
            ]}
          />
        }
      />
      {error && <LoadError text={error} onRetry={load} />}
      <Card as="section">
        <CardHead
          title={items ? `${list.length} ${plural(list.length, "сессия", "сессии", "сессий")}` : "Загружаем"}
          sub={items && list.length ? `Оплачено на ${rub(sum)}` : undefined}
        />
        {!items && !error ? (
          <Skeleton height={240} />
        ) : list.length ? (
          <SessionsTable sessions={list} />
        ) : (
          <EmptyState
            icon={<CalendarDays size={22} />}
            title={filter === "all" ? "Сессий пока нет" : "Под фильтр ничего не подошло"}
            text={filter === "all" ? "Первая запись клиента появится здесь сразу после оплаты." : "Выберите другой статус или «Все»."}
          />
        )}
      </Card>
    </>
  );
}
