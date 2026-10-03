"use client";

import { t, intlLocale } from "@/lib/i18n";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Camera, ChevronRight, PencilLine, Smile, Users, Wallet } from "lucide-react";
import { Skeleton } from "@/ui";
import { AvatarThumb } from "@/components/avatar/AvatarThumb";
import { SpecialistPhoto } from "@/components/avatar/SpecialistPhoto";
import { useAuth } from "@/lib/auth/store";
import { sessionsApi } from "@/lib/api/endpoints";
import { dayLabel, plural, time } from "@/lib/format";
import { useLoad } from "@/components/client/useLoad";
import { splitSessions } from "@/components/client/sessions";
import { ErrorBlock } from "@/components/client/ClientBits";
import { ChangeNickname } from "@/components/client/ChangeNickname";
import { PrivacyAndSecurity } from "@/components/client/PrivacyAndSecurity";
import s from "./profile.module.css";

export default function ClientProfile() {
  const user = useAuth((st) => st.user);
  const [nickOpen, setNickOpen] = useState(false);
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
  const talk = minutes < 120 ? t(`{minutes} мин`, { minutes }) : t(`{v} ч`, { v: hours.toLocaleString(intlLocale()) });

  return (
    <div className={s.page}>
      <section className={s.head}>
        <Link href="/app/avatar" className={s.avatar} aria-label={t("Изменить аватар")}>
          <AvatarThumb config={user.avatar_config} seed={user.id} size={64} />
        </Link>
        <div className={s.who}>
          <h1 className={s.alias}>
            {user.alias}
            {user.role === "client" && (
              <button type="button" className={s.editNick} onClick={() => setNickOpen(true)} aria-label={t("Сменить ник")} title={t("Сменить ник")}>
                <PencilLine size={16} strokeWidth={1.9} aria-hidden />
              </button>
            )}
          </h1>
          <span className={s.since}>
            {t("с")}{" "}{new Date(user.created_at).toLocaleDateString(intlLocale(), { day: "numeric", month: "long", year: "numeric" }).replace(" г.", "")}
          </span>
        </div>
      </section>

      <ChangeNickname open={nickOpen} onClose={() => setNickOpen(false)} />

      {sessions.error && <ErrorBlock message={sessions.error} onRetry={sessions.reload} />}

      <dl className={s.stats} aria-busy={loading || undefined}>
        <div>
          <dt>{t("Созвонов")}</dt>
          <dd>{loading ? "·" : held}</dd>
        </div>
        <div>
          <dt>{t("Проведено")}</dt>
          <dd>{loading ? "·" : completed.length}</dd>
        </div>
        <div>
          <dt>{t("Разговора")}</dt>
          <dd>{loading ? "·" : completed.length ? talk : "0"}</dd>
        </div>
        {next && (
          <div>
            <dt>{t("Ближайший")}</dt>
            <dd>
              {time(next.scheduled_at)} <small>{dayLabel(next.scheduled_at)}</small>
            </dd>
          </div>
        )}
      </dl>

      {(loading || people.length > 0) && (
        <section className={s.section}>
          <h2 className={s.sectionTitle}>{t("Ваши специалисты")}</h2>
          {loading ? (
            <Skeleton height={56} radius={16} />
          ) : (
            <ul className={s.list}>
              {people.map((p) => (
                <li key={p.id}>
                  <Link href={`/app/specialists/${p.id}`} className={s.row}>
                    <SpecialistPhoto url={p.photo} name={p.name} size={36} />
                    <span className={s.rowText}>
                      <strong>{p.name}</strong>
                      <span>
                        {p.count} {plural(p.count, "созвон", "созвона", "созвонов")}
                      </span>
                    </span>
                    <ChevronRight size={18} strokeWidth={1.8} className={s.go} aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className={s.section}>
        <h2 className={s.sectionTitle}>{t("Настройки")}</h2>
        <ul className={s.list}>
          {[
            { href: "/app/avatar", icon: Smile, title: t("Аватар") },
            { href: "/app/avatar/mirror", icon: Camera, title: t("Проверка камеры") },
            { href: "/app/balance", icon: Wallet, title: t("Баланс") },
            { href: "/app/circles", icon: Users, title: t("Круги") },
          ].map((row) => (
            <li key={row.href}>
              <Link href={row.href} className={s.row}>
                <span className={s.rowIcon} aria-hidden>
                  <row.icon size={18} strokeWidth={1.8} />
                </span>
                <span className={s.rowText}>
                  <strong>{row.title}</strong>
                </span>
                <ChevronRight size={18} strokeWidth={1.8} className={s.go} aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className={s.section} aria-labelledby="privacy-title">
        <h2 id="privacy-title" className={s.sectionTitle}>
          {t("Приватность и\u00a0безопасность")}
        </h2>
        <PrivacyAndSecurity />
      </section>
    </div>
  );
}
