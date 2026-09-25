"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Camera, ChevronRight, ShieldCheck, Smile } from "lucide-react";
import { Button, Card, CardHead, Skeleton, Stat } from "@/ui";
import { WithRail } from "@/components/shell/AppShell";
import { AvatarThumb } from "@/components/avatar/AvatarThumb";
import { SpecialistPhoto } from "@/components/avatar/SpecialistPhoto";
import { useAuth } from "@/lib/auth/store";
import { sessionsApi } from "@/lib/api/endpoints";
import { dayLabel, plural, time, untilLabel } from "@/lib/format";
import { useLoad } from "@/components/client/useLoad";
import { splitSessions } from "@/components/client/sessions";
import { ErrorBlock } from "@/components/client/ClientBits";
import { NextSessionCard, SupportCard } from "@/components/client/NextSessionCard";
import s from "./profile.module.css";
import { illSize, SpecialistFriend } from "@/components/illustrations";

export default function ClientProfile() {
  const user = useAuth((st) => st.user);
  const sessions = useLoad(() => sessionsApi.list());
  const list = useMemo(() => sessions.data ?? [], [sessions.data]);
  const { upcoming } = useMemo(() => splitSessions(list), [list]);
  const next = upcoming[0] ?? null;
  const completed = list.filter((x) => x.status === "completed");
  const held = list.filter((x) => x.status !== "cancelled" && x.status !== "refunded").length;
  const minutes = completed.reduce((sum, x) => sum + x.duration_minutes, 0);
  const hours = Math.round((minutes / 60) * 10) / 10;

  // Specialists you have met (or are about to), most recent first, no duplicates
  const people = useMemo(() => {
    const seen = new Map<number, { id: number; name: string; photo?: string | null; count: number }>();
    for (const x of [...list].sort((a, b) => +new Date(b.scheduled_at) - +new Date(a.scheduled_at))) {
      if (x.status === "cancelled" || x.status === "refunded") continue;
      const p = seen.get(x.psychologist.id);
      if (p) p.count++;
      else seen.set(x.psychologist.id, { id: x.psychologist.id, name: x.psychologist.display_name, photo: x.psychologist.photo_url, count: 1 });
    }
    return [...seen.values()];
  }, [list]);

  if (!user) return null;
  const loading = sessions.loading && !sessions.data;

  return (
    <WithRail
      rail={
        <>
          <NextSessionCard session={next} loading={loading} />
          <SupportCard />
        </>
      }
    >
      <Card as="section" className={s.head}>
        <Link href="/app/avatar" className={s.avatar} aria-label="Изменить аватар">
          <AvatarThumb config={user.avatar_config} seed={user.id} size={112} />
        </Link>
        <div className={s.who}>
          <span className={s.label}>Ваш псевдоним</span>
          <h1 className={s.alias}>{user.alias}</h1>
          <span className={s.since}>На aprosop с {new Date(user.created_at).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" }).replace(" г.", "")}</span>
          <div className={s.actions}>
            <Button variant="secondary" size="sm" href="/app/avatar" icon={<Smile size={16} strokeWidth={1.8} />}>
              Изменить аватар
            </Button>
            <Button variant="ghost" size="sm" href="/app/privacy" icon={<ShieldCheck size={16} strokeWidth={1.8} />}>
              Приватность
            </Button>
          </div>
        </div>
      </Card>

      {sessions.error && <ErrorBlock message={sessions.error} onRetry={sessions.reload} />}

      <div className={s.stats}>
        {loading ? (
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
              note={next ? `${dayLabel(next.scheduled_at)}, ${untilLabel(next.scheduled_at)}` : "Запишитесь, когда будете готовы"}
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
              value={completed.length}
              note={
                completed.length
                  ? minutes < 120
                    ? `${minutes} ${plural(minutes, "минута", "минуты", "минут")} разговора`
                    : `${hours.toLocaleString("ru-RU")} ${Number.isInteger(hours) ? plural(hours, "час", "часа", "часов") : "часа"} разговора`
                  : "Первая встреча ещё впереди"
              }
            />
            <Stat label="Мы знаем о вас" value="2" tone="success" note="Псевдоним и аватар. Больше ничего" />
          </>
        )}
      </div>

      <Card as="section">
        <CardHead title="Ваши специалисты" sub="С кем вы уже встречались или записаны" />
        {loading ? (
          <Skeleton height={64} radius={18} />
        ) : people.length === 0 ? (
          <div className={s.empty}>
            <SpecialistFriend className={illSize.xs} />
            <p>Здесь появятся специалисты, с которыми у вас будут сессии.</p>
            <Button variant="primary" size="sm" href="/app/specialists">
              Выбрать специалиста
            </Button>
          </div>
        ) : (
          <ul className={s.people}>
            {people.map((p) => (
              <li key={p.id}>
                <Link href={`/app/specialists/${p.id}`} className={s.person}>
                  <SpecialistPhoto url={p.photo} name={p.name} size={44} />
                  <span className={s.personText}>
                    <strong>{p.name}</strong>
                    <span>
                      {p.count} {plural(p.count, "сессия", "сессии", "сессий")}
                    </span>
                  </span>
                  <ChevronRight size={18} strokeWidth={1.8} className={s.go} aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card as="section">
        <CardHead title="Настройки" />
        <ul className={s.people}>
          {[
            { href: "/app/privacy", icon: ShieldCheck, title: "Приватность и безопасность", text: "Пароль, ключ восстановления, удаление аккаунта" },
            { href: "/app/avatar", icon: Smile, title: "Мой аватар", text: "Как вас видит специалист" },
            { href: "/app/check", icon: Camera, title: "Проверка камеры", text: "Свет и мимика перед сессией" },
          ].map((row) => (
            <li key={row.href}>
              <Link href={row.href} className={s.person}>
                <span className={s.rowIcon} aria-hidden>
                  <row.icon size={20} strokeWidth={1.8} />
                </span>
                <span className={s.personText}>
                  <strong>{row.title}</strong>
                  <span>{row.text}</span>
                </span>
                <ChevronRight size={18} strokeWidth={1.8} className={s.go} aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </WithRail>
  );
}
