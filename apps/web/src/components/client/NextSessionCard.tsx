"use client";

import { t, tj } from "@/lib/i18n";
import Link from "next/link";
import {
  CalendarDays,
  ChevronDown,
  Headphones,
  Lamp,
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
import { SearchTrigger } from "@/components/search/SpecialistSearch";

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
            {t("Первая встреча")}
          </h2>
        </div>
        <p className={s.lead}>
          {t("Выберите специалиста и\u00a0удобное время. Сессия пройдёт по\u00a0видео, но\u00a0вместо лица специалист увидит ваш аватар.")}
        </p>
        <div className={s.rows}>
          <Row
            icon={<CalendarDays size={18} strokeWidth={1.8} />}
            title={t("От\u00a050\u00a0минут до\u00a03\u00a0часов")}
            sub={t("Длительность выбираете при\u00a0записи, цена зависит от\u00a0неё")}
          />
          <Row
            icon={<ShieldCheck size={18} strokeWidth={1.8} />}
            title={t("Оплата после подтверждения")}
            sub={t("Отменить можно до\u00a0начала созвона")}
          />
        </div>
        <SearchTrigger variant="white" size="lg" block>
          {t("Выбрать специалиста")}
        </SearchTrigger>
      </section>
    );
  }

  const starts = new Date(session.scheduled_at);
  const p = session.psychologist;

  return (
    <section className={s.accent} aria-labelledby={titleId}>
      <div className={s.head}>
        <h2 id={titleId} className={s.title}>
          {t("Ближайший созвон")}
        </h2>
        <span className={s.pill}>
          {session.can_join ? t("Можно входить") : untilLabel(starts)}
        </span>
      </div>

      <div className={s.person}>
        <SpecialistPhoto url={p.photo_url} name={p.display_name} size={72} />
        <div className={s.personText}>
          <strong>{p.display_name}</strong>
          <span>
            {tj("{duration_minutes} минут, {rub}", { duration_minutes: session.duration_minutes, rub: rub(session.amount_rub) })}
          </span>
        </div>
      </div>

      <div className={s.rows}>
        <Row
          icon={<CalendarDays size={18} strokeWidth={1.8} />}
          title={t(`{dayLabel} в\u00a0{time}`, { dayLabel: dayLabel(starts), time: time(starts) })}
          sub={
            untilLabel(starts) === "уже началась"
              ? t("Сессия уже идёт")
              : t(`Начало {untilLabel}`, { untilLabel: untilLabel(starts) })
          }
        />
        {session.can_join ? (
          <Row
            icon={<ShieldCheck size={18} strokeWidth={1.8} />}
            title={t("Вы\u00a0будете аватаром")}
            sub={t("Ваше лицо не\u00a0передаётся, звонок зашифрован")}
          />
        ) : (
          <details className={s.tips}>
            <summary>
              <strong>{t("Как\u00a0подготовиться")}</strong>
              <ChevronDown size={16} strokeWidth={2} aria-hidden className={s.tipsChevron} />
            </summary>
            <ul>
              <li>
                <Lamp size={16} strokeWidth={1.8} aria-hidden />{" "}{t("Свет спереди, чтобы аватар точнее повторял мимику")}
              </li>
              <li>
                <Headphones size={16} strokeWidth={1.8} aria-hidden />{" "}{t("Наушники и\u00a0место, где вас не\u00a0услышат")}
              </li>
              <li>
                <Sparkles size={16} strokeWidth={1.8} aria-hidden />{" "}{t("Пара мыслей о\u00a0том, с\u00a0чем\u00a0хотите прийти")}
              </li>
            </ul>
          </details>
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
          {t("Присоединиться")}
        </Button>
      ) : (
        <Button variant="white" size="lg" block href="/app/check">
          {t("Проверить камеру")}
        </Button>
      )}
      {showAllLink && (
        <Link href="/app/sessions" className={s.link}>
          {t("Все диалоги")}
        </Link>
      )}
    </section>
  );
}
