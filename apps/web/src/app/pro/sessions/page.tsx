"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarClock, History, Video } from "lucide-react";
import { Button, Card, CardHead, EmptyState, Segmented, Skeleton } from "@/ui";
import { PageHeader } from "@/components/shell/AppShell";
import { SessionRow } from "@/components/pro/SessionRow";
import { LoadError } from "@/components/pro/controls";
import { sessionsApi } from "@/lib/api/endpoints";
import type { Session } from "@/lib/api/types";
import { plural, rub } from "@/lib/format";
import s from "@/components/pro/pro.module.css";

type Tab = "today" | "upcoming" | "past";
const TABS: Tab[] = ["today", "upcoming", "past"];
const ACTIVE = new Set(["awaiting_payment", "paid", "in_progress"]);

function startOfDay(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <SessionsPage />
    </Suspense>
  );
}

function SessionsPage() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const initial = params.get("tab") as Tab | null;
  const [tab, setTab] = useState<Tab>(initial && TABS.includes(initial) ? initial : "today");
  const [items, setItems] = useState<Session[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    sessionsApi
      .list()
      .then(setItems)
      .catch((e) => setError(`${(e as Error).message} Попробуйте обновить список.`));
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const changeTab = (t: Tab) => {
    setTab(t);
    router.replace(`${pathname}?tab=${t}`, { scroll: false });
  };

  const groups = useMemo(() => {
    const today0 = startOfDay();
    const tomorrow0 = today0 + 86400000;
    const at = (x: Session) => new Date(x.scheduled_at).getTime();
    const all = items ?? [];
    const asc = (a: Session, b: Session) => at(a) - at(b);
    return {
      today: all.filter((x) => at(x) >= today0 && at(x) < tomorrow0).sort(asc),
      upcoming: all.filter((x) => at(x) >= tomorrow0 && ACTIVE.has(x.status)).sort(asc),
      past: all.filter((x) => at(x) < today0 || (at(x) >= tomorrow0 && !ACTIVE.has(x.status))).sort((a, b) => asc(b, a)),
    };
  }, [items]);

  const earned = groups.past.filter((x) => x.status === "completed");
  const earnedSum = earned.reduce((n, x) => n + x.amount_rub, 0);

  const replace = (next: Session) => setItems((xs) => (xs ?? []).map((x) => (x.id === next.id ? next : x)));
  const list = groups[tab];

  const heads: Record<Tab, { title: string; sub: string }> = {
    today: {
      title: "Сегодня",
      sub: list.length
        ? `${list.length} ${plural(list.length, "сессия", "сессии", "сессий")}. Войти можно за 10 минут до начала`
        : "Войти в сессию можно за 10 минут до начала",
    },
    upcoming: {
      title: "Предстоящие",
      sub: list.length ? `${list.length} ${plural(list.length, "запись", "записи", "записей")} после сегодняшнего дня` : "Записи после сегодняшнего дня",
    },
    past: {
      title: "Прошедшие",
      sub: earned.length
        ? `Проведено ${earned.length} ${plural(earned.length, "сессия", "сессии", "сессий")} на ${rub(earnedSum)}`
        : "Здесь появятся проведённые и отменённые сессии",
    },
  };

  return (
    <>
      <PageHeader
        title="Сессии"
        sub="Клиенты анонимны: вы видите только псевдоним и аватар."
        action={
          <Segmented<Tab>
            ariaLabel="Какие сессии показать"
            value={tab}
            onChange={changeTab}
            options={[
              { value: "today", label: `Сегодня${groups.today.length ? ` ${groups.today.length}` : ""}` },
              { value: "upcoming", label: `Предстоящие${groups.upcoming.length ? ` ${groups.upcoming.length}` : ""}` },
              { value: "past", label: "Прошедшие" },
            ]}
          />
        }
      />
      {error && <LoadError text={error} onRetry={load} />}
      <Card as="section">
        <CardHead title={heads[tab].title} sub={heads[tab].sub} />
        {!items && !error ? (
          <div className={s.rows}>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} height={68} radius={18} />
            ))}
          </div>
        ) : list.length ? (
          <div className={s.rows}>
            {list.map((x) => (
              <SessionRow key={x.id} session={x} onChange={replace} />
            ))}
          </div>
        ) : tab === "today" ? (
          <EmptyState
            icon={<Video size={22} />}
            title="Сегодня сессий нет"
            text={
              groups.upcoming.length
                ? "Ближайшие записи на вкладке «Предстоящие»."
                : "Чтобы клиенты могли записаться, откройте больше часов в расписании."
            }
            action={
              groups.upcoming.length ? (
                <Button variant="secondary" onClick={() => changeTab("upcoming")}>
                  Показать предстоящие
                </Button>
              ) : (
                <Button variant="primary" href="/pro/schedule">
                  Открыть расписание
                </Button>
              )
            }
          />
        ) : tab === "upcoming" ? (
          <EmptyState
            icon={<CalendarClock size={22} />}
            title="Новых записей пока нет"
            text="Клиенты записываются в свободные часы из вашего расписания. Чем больше открытых часов, тем проще найти время."
            action={
              <Button variant="primary" href="/pro/schedule">
                Открыть расписание
              </Button>
            }
          />
        ) : (
          <EmptyState icon={<History size={22} />} title="Прошедших сессий нет" text="После первой проведённой сессии здесь появится история и доход." />
        )}
      </Card>
    </>
  );
}
