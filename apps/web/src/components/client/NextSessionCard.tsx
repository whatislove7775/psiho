"use client";

import Link from "next/link";
import {
  CalendarDays,
  Headphones,
  Lamp,
  LifeBuoy,
  ShieldCheck,
  Sparkles,
  Video,
} from "lucide-react";
import { useId, type ReactNode } from "react";
import { Button, Skeleton } from "@/ui";
import { SpecialistPhoto } from "@/components/avatar/SpecialistPhoto";
import type { Session } from "@/lib/api/types";
import { dayLabel, rub, time, untilLabel } from "@/lib/format";
import s from "./rail.module.css";

function Row({
  icon,
  title,
  sub,
}: {
  icon: ReactNode;
  title: ReactNode;
  sub: ReactNode;
}) {
  return (
    <div className={s.row}>
      <span className={s.rowIcon} aria-hidden>
        {icon}
      </span>
      <span className={s.rowText}>
        <strong>{title}</strong>
        <span>{sub}</span>
      </span>
    </div>
  );
}

/** Blue accent card of the right rail: the nearest session, or an invitation to book. */
export function NextSessionCard({
  session,
  loading,
  showAllLink = true,
}: {
  session: Session | null;
  loading?: boolean;
  showAllLink?: boolean;
}) {
  const titleId = useId();
  if (loading) {
    return (
      <section className={s.accent} aria-busy>
        <div className={s.skel}>
          <Skeleton width="60%" height={22} />
          <Skeleton width={72} height={72} radius={36} />
          <Skeleton height={58} radius={18} />
          <Skeleton height={58} radius={18} />
          <Skeleton height={54} radius={999} />
        </div>
      </section>
    );
  }

  if (!session) {
    return (
      <section className={s.accent} aria-labelledby={titleId}>
        <div className={s.head}>
          <h2 id={titleId} className={s.title}>
            Первая встреча
          </h2>
        </div>
        <p className={s.lead}>
          Выберите специалиста и удобное время. Сессия пройдёт по видео, но
          вместо лица специалист увидит ваш аватар.
        </p>
        <div className={s.rows}>
          <Row
            icon={<CalendarDays size={18} strokeWidth={1.8} />}
            title="От 50 минут до 3 часов"
            sub="Длительность выбираете при записи, цена зависит от неё"
          />
          <Row
            icon={<ShieldCheck size={18} strokeWidth={1.8} />}
            title="Оплата после подтверждения"
            sub="Отменить можно до начала сессии"
          />
        </div>
        <Button variant="white" size="lg" block href="/app/specialists">
          Выбрать специалиста
        </Button>
      </section>
    );
  }

  const starts = new Date(session.scheduled_at);
  const p = session.psychologist;

  return (
    <section className={s.accent} aria-labelledby={titleId}>
      <div className={s.head}>
        <h2 id={titleId} className={s.title}>
          Ближайшая сессия
        </h2>
        <span className={s.pill}>
          {session.can_join ? "Можно входить" : untilLabel(starts)}
        </span>
      </div>

      <div className={s.person}>
        <SpecialistPhoto url={p.photo_url} name={p.display_name} size={72} />
        <div className={s.personText}>
          <strong>{p.display_name}</strong>
          <span>
            {session.duration_minutes} минут, {rub(session.amount_rub)}
          </span>
        </div>
      </div>

      <div className={s.rows}>
        <Row
          icon={<CalendarDays size={18} strokeWidth={1.8} />}
          title={`${dayLabel(starts)} в ${time(starts)}`}
          sub={
            untilLabel(starts) === "уже началась"
              ? "Сессия уже идёт"
              : `Начало ${untilLabel(starts)}`
          }
        />
        {session.can_join ? (
          <Row
            icon={<ShieldCheck size={18} strokeWidth={1.8} />}
            title="Вы будете аватаром"
            sub="Ваше лицо не передаётся, звонок зашифрован"
          />
        ) : (
          <div className={s.tips}>
            <strong>Как подготовиться</strong>
            <ul>
              <li>
                <Lamp size={16} strokeWidth={1.8} aria-hidden /> Свет спереди,
                чтобы аватар точнее повторял мимику
              </li>
              <li>
                <Headphones size={16} strokeWidth={1.8} aria-hidden /> Наушники
                и место, где вас не услышат
              </li>
              <li>
                <Sparkles size={16} strokeWidth={1.8} aria-hidden /> Пара мыслей
                о том, с чем хотите прийти
              </li>
            </ul>
          </div>
        )}
      </div>

      {session.can_join ? (
        <Button
          variant="white"
          size="lg"
          block
          href={`/room/${session.id}`}
          icon={<Video size={20} strokeWidth={1.8} />}
        >
          Войти в сессию
        </Button>
      ) : (
        <Button variant="white" size="lg" block href="/app/check">
          Проверить камеру
        </Button>
      )}
      {showAllLink && (
        <Link href="/app/sessions" className={s.link}>
          Все мои сессии
        </Link>
      )}
    </section>
  );
}

/** Always-visible, quiet pointer to emergency help. */
export function SupportCard() {
  return (
    <section className={s.support} aria-label="Срочная помощь">
      <span className={s.supportIcon} aria-hidden>
        <LifeBuoy size={20} strokeWidth={1.8} />
      </span>
      <div>
        <strong>Если сейчас очень тяжело</strong>
        <p>
          Онлайн-сессия не заменяет экстренную помощь. Если есть угроза жизни,
          позвоните <a href="tel:112">112</a>, это бесплатно и круглосуточно.
        </p>
      </div>
    </section>
  );
}
