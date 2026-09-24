"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  CalendarCheck,
  Check,
  ChevronRight,
  Search,
  ShieldCheck,
  Smile,
  Wind,
  Camera,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardHead,
  QuickAction,
  Skeleton,
  Stat,
} from "@/ui";
import { PageHeader, WithRail } from "@/components/shell/AppShell";
import { useAuth } from "@/lib/auth/store";
import { sessionsApi } from "@/lib/api/endpoints";
import { dayLabel, plural, time, untilLabel } from "@/lib/format";
import { useLoad } from "@/components/client/useLoad";
import { checkDone, splitSessions } from "@/components/client/sessions";
import { ErrorBlock } from "@/components/client/ClientBits";
import { BreathingModal } from "@/components/client/BreathingModal";
import {
  NextSessionCard,
  SupportCard,
} from "@/components/client/NextSessionCard";
import s from "./home.module.css";

function greeting(d = new Date()) {
  const h = d.getHours();
  if (h < 5) return "Доброй ночи";
  if (h < 12) return "Доброе утро";
  if (h < 18) return "Добрый день";
  return "Добрый вечер";
}

export default function ClientHome() {
  const user = useAuth((st) => st.user);
  const sessions = useLoad(() => sessionsApi.list());
  const [breathing, setBreathing] = useState(false);
  const [checked, setChecked] = useState(false);
  const [hello, setHello] = useState("Здравствуйте");

  useEffect(() => {
    setChecked(checkDone.get());
    setHello(greeting());
  }, []);

  const list = sessions.data ?? [];
  const { upcoming } = useMemo(() => splitSessions(list), [list]);
  const next = upcoming[0] ?? null;
  const completed = list.filter((x) => x.status === "completed").length;
  const hasAny = list.length > 0;
  const held = list.filter((x) => x.status !== "cancelled" && x.status !== "refunded").length;

  const steps = [
    {
      done: !!user?.avatar_config,
      title: "Создать аватар",
      text: "Им вы будете в видеосессии вместо лица",
      href: "/app/avatar",
    },
    {
      done: hasAny,
      title: "Выбрать специалиста",
      text: "Все психологи проверены, у каждого своя манера",
      href: "/app/specialists",
    },
    {
      done: hasAny,
      title: "Записаться на первую сессию",
      text: "50 или 80 минут в удобное вам время",
      href: "/app/specialists",
    },
    {
      done: checked,
      title: "Проверить камеру и свет",
      text: "Минута, чтобы аватар точно повторял мимику",
      href: "/app/check",
    },
  ];
  const doneCount = steps.filter((x) => x.done).length;
  const showSteps = sessions.loading || doneCount < steps.length;

  return (
    <>
      <PageHeader
        title={`${hello}, ${user?.alias ?? ""}`}
        sub="Здесь вы под псевдонимом. Специалист видит только ваш аватар."
        action={
          <Button
            variant="primary"
            size="md"
            href="/app/specialists"
            icon={<Search size={18} strokeWidth={1.8} />}
          >
            Найти специалиста
          </Button>
        }
      />

      <WithRail
        rail={
          <>
            <div className={s.wideOnly}>
              <NextSessionCard
                session={next}
                loading={sessions.loading && !sessions.data}
              />
            </div>
            <SupportCard />
          </>
        }
      >
        {sessions.error && (
          <ErrorBlock message={sessions.error} onRetry={sessions.reload} />
        )}

        {/* On narrow screens the nearest session is the first thing you see */}
        <div className={s.narrowOnly}>
          <NextSessionCard
            session={next}
            loading={sessions.loading && !sessions.data}
          />
        </div>

        {showSteps && (
          <Card as="section">
            <CardHead
              title="Первые шаги"
              sub="Всё, что поможет прийти на первую встречу спокойно"
              action={
                sessions.loading ? null : (
                  <Badge tone={doneCount ? "warning" : "neutral"}>
                    {doneCount} из {steps.length}
                  </Badge>
                )
              }
            />
            <div className={s.progress} aria-hidden>
              <span style={{ width: `${(doneCount / steps.length) * 100}%` }} />
            </div>
            <ul className={s.steps}>
              {steps.map((st) => (
                <li key={st.title}>
                  <Link
                    href={st.href}
                    className={s.step}
                    data-done={st.done || undefined}
                  >
                    <span className={s.stepCheck} aria-hidden>
                      {st.done && <Check size={16} strokeWidth={2.4} />}
                    </span>
                    <span className={s.stepText}>
                      <strong>{st.title}</strong>
                      <span>{st.done ? "Готово" : st.text}</span>
                    </span>
                    {!st.done && (
                      <ChevronRight
                        size={18}
                        strokeWidth={1.8}
                        className={s.stepGo}
                        aria-hidden
                      />
                    )}
                    <span className={s.srOnly}>
                      {st.done ? ", выполнено" : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card as="section">
          <CardHead title="Быстрые инструменты" />
          <div className={s.quick}>
            <QuickAction
              tone="peach"
              href="/app/specialists"
              icon={<Search size={24} strokeWidth={1.8} />}
              label={
                <>
                  Найти
                  <br />
                  специалиста
                </>
              }
            />
            <QuickAction
              tone="butter"
              href="/app/sessions"
              icon={<CalendarCheck size={24} strokeWidth={1.8} />}
              label={
                <>
                  Мои
                  <br />
                  сессии
                </>
              }
            />
            <QuickAction
              tone="lime"
              href="/app/avatar"
              icon={<Smile size={24} strokeWidth={1.8} />}
              label={
                <>
                  Мой
                  <br />
                  аватар
                </>
              }
            />
            <QuickAction
              tone="mint"
              href="/app/check"
              icon={<Camera size={24} strokeWidth={1.8} />}
              label={
                <>
                  Проверить
                  <br />
                  камеру
                </>
              }
            />
            <QuickAction
              tone="lilac"
              onClick={() => setBreathing(true)}
              icon={<Wind size={24} strokeWidth={1.8} />}
              label={
                <>
                  Дыхательная
                  <br />
                  пауза
                </>
              }
            />
            <QuickAction
              tone="sky"
              href="/app/privacy"
              icon={<ShieldCheck size={24} strokeWidth={1.8} />}
              label={<>Приват&shy;ность</>}
            />
          </div>
        </Card>

        <div className={s.stats}>
          {sessions.loading && !sessions.data ? (
            [0, 1, 2, 3].map((i) => (
              <div key={i} className={s.statSkel}>
                <Skeleton width="70%" height={14} />
                <Skeleton width="50%" height={32} />
                <Skeleton width="80%" height={12} />
              </div>
            ))
          ) : (
            <>
              <Stat
                label="Ближайшая сессия"
                value={next ? time(next.scheduled_at) : "Нет"}
                note={
                  next
                    ? `${dayLabel(next.scheduled_at)}, ${untilLabel(next.scheduled_at)}`
                    : "Запишитесь, когда будете готовы"
                }
                tone={next?.can_join ? "success" : undefined}
              />
              <Stat
                label="Всего сессий"
                value={held}
                note={
                  upcoming.length
                    ? `${upcoming.length} ${plural(upcoming.length, "предстоит", "предстоят", "предстоят")}`
                    : "Пока ничего не запланировано"
                }
              />
              <Stat
                label="Проведено"
                value={completed}
                note={
                  completed
                    ? `${plural(completed, "Встреча", "Встречи", "Встреч")} уже позади`
                    : "Первая ещё впереди"
                }
              />
              <Stat
                label="Мы знаем о вас"
                value="2"
                tone="success"
                note="Псевдоним и аватар. Больше ничего"
              />
            </>
          )}
        </div>
      </WithRail>

      <BreathingModal open={breathing} onClose={() => setBreathing(false)} />
    </>
  );
}
