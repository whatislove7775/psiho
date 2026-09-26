"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Camera, ChevronRight, ListChecks, Search, Smile, Users, Wind } from "lucide-react";
import { useAuth } from "@/lib/auth/store";
import { psychologistsApi } from "@/lib/api/endpoints";
import { contentApi } from "@/lib/api/content";
import { circlesApi, type CircleCard, type MyCircleRow } from "@/lib/api/circles";
import { dialogHref } from "@/lib/api/dialogs";
import { dayLabel, time } from "@/lib/format";
import { useLoad } from "@/components/client/useLoad";
import { checkDone } from "@/components/client/sessions";
import { ErrorBlock } from "@/components/client/ClientBits";
import { NextCallStrip, useDialogsSummary } from "@/components/dialogs/HomeWidgets";
import { SpecialistMini, SpecialistMiniSkeleton } from "@/components/client/SpecialistMini";
import { AvatarThumb } from "@/components/avatar/AvatarThumb";
import { ConvAvatar } from "@/components/chat/ConvAvatar";
import { TopicArt } from "@/components/illustrations/topics";
import { topicClass } from "@/components/circles/bits";
import { SearchTrigger } from "@/components/search/SpecialistSearch";
import { Skeleton } from "@/ui";
import c from "@/components/content/content.module.css";
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
  const dialogs = useDialogsSummary();
  const specialists = useLoad(() => psychologistsApi.list());
  const articles = useLoad(() => contentApi.articles({ limit: 6 }));
  const practices = useLoad(() => contentApi.practices({ limit: 4 }));
  const circles = useLoad(() => circlesApi.list());
  const myCircles = useLoad(() => circlesApi.mine());
  const [checked, setChecked] = useState(true);
  const [hello, setHello] = useState("Здравствуйте");

  useEffect(() => {
    setChecked(checkDone.get());
    setHello(greeting());
  }, []);

  const hasAny = useMemo(() => (dialogs.items ?? []).some((d) => d.kind === "specialist"), [dialogs.items]);
  const featured = (specialists.data ?? []).slice(0, 10);

  // Circles row: mine first (with their next meeting), then open ones.
  const circleRow = useMemo(() => {
    const mine = myCircles.data?.results ?? [];
    const ids = new Set(mine.map((x) => x.id));
    const open = (circles.data?.results ?? []).filter((x) => !ids.has(x.id));
    return [...mine, ...open].slice(0, 8) as (CircleCard | MyCircleRow)[];
  }, [circles.data, myCircles.data]);

  return (
    <div className={s.home}>
      <header className={s.greet}>
        <h1 className={s.greetTitle}>
          {hello}, <span className={s.alias}>{user?.alias ?? ""}</span>
        </h1>
        <Link href="/app/avatar" className={s.greetAvatar} aria-label="Мой аватар">
          <AvatarThumb config={user?.avatar_config} seed={user?.id} size={40} />
        </Link>
      </header>

      <div className={s.actions}>
        <SearchTrigger variant="primary" size="md" icon={<Search size={17} strokeWidth={2} />}>
          Найти специалиста
        </SearchTrigger>
        {!dialogs.loading && !hasAny && (
          <Chip href="/app/match" icon={<ListChecks size={16} strokeWidth={1.8} />}>
            Подбор по анкете
          </Chip>
        )}
        {!user?.avatar_config && (
          <Chip href="/app/avatar" icon={<Smile size={16} strokeWidth={1.8} />}>
            Создать аватар
          </Chip>
        )}
        {!checked && (
          <Chip href="/app/avatar/mirror" icon={<Camera size={16} strokeWidth={1.8} />}>
            Проверить камеру
          </Chip>
        )}
        <Chip href="/app/practices/dyhanie-4-6" icon={<Wind size={16} strokeWidth={1.8} />}>
          Дыхательная пауза
        </Chip>
      </div>

      {dialogs.error && <ErrorBlock message={dialogs.error} onRetry={dialogs.reload} />}

      <NextCallStrip item={dialogs.next} role="client" />

      {hasAny && dialogs.recent.length > 0 && (
        <Section title="Диалоги" href="/app/dialogs">
          <div className={s.dialogs}>
            {dialogs.recent.slice(0, 3).map((d) => (
              <Link key={d.id} href={dialogHref("client", d.id)} className={s.dialog}>
                <ConvAvatar who={d.counterpart} size={36} />
                <span className={s.dialogText}>
                  <strong>{d.counterpart.name}</strong>
                  <span>{d.last_message?.text || (d.last_message?.card ? "Созвон" : "Нет сообщений")}</span>
                </span>
                {d.unread > 0 && <span className={s.unread}>{d.unread}</span>}
              </Link>
            ))}
          </div>
        </Section>
      )}

      <Section title="Специалисты" href="/app/specialists">
        {specialists.error ? (
          <ErrorBlock message={specialists.error} onRetry={specialists.reload} />
        ) : (
          <div className={s.scroller} role="list">
            {specialists.loading && !specialists.data
              ? [0, 1, 2, 3].map((i) => (
                  <div role="listitem" key={i} className={s.specItem}>
                    <SpecialistMiniSkeleton />
                  </div>
                ))
              : featured.map((p) => (
                  <div role="listitem" key={p.id} className={s.specItem}>
                    <SpecialistMini p={p} compact />
                  </div>
                ))}
          </div>
        )}
      </Section>

      {circleRow.length === 0 && circles.data && (
        <Link href="/app/circles" className={s.entry}>
          <Users size={18} strokeWidth={1.8} aria-hidden />
          <span>
            <strong>Круги</strong> · группы поддержки с психологом
          </span>
          <ChevronRight size={16} strokeWidth={2} aria-hidden />
        </Link>
      )}
      {circleRow.length > 0 && (
        <Section title="Круги" href="/app/circles">
          <div className={s.scroller} role="list">
            {circleRow.map((x) => {
              const next = "next_meeting" in x ? x.next_meeting?.starts_at : x.next_meeting_at ?? x.first_meeting_at;
              const mine = "me" in x;
              return (
                <Link role="listitem" key={x.id} href={`/app/circles/${x.id}`} className={`${s.circle} ${topicClass(x.topic)}`}>
                  <span className={s.circleTopic}>{mine ? "Вы в круге" : x.topic_label}</span>
                  <strong className={s.circleTitle}>{x.title}</strong>
                  <span className={s.circleMeta}>{next ? `${dayLabel(next)}, ${time(next)}` : "Скоро"}</span>
                </Link>
              );
            })}
          </div>
        </Section>
      )}

      <Section title="Полезное" href="/app/articles">
        <div className={s.scroller} role="list">
          {articles.loading && !articles.data
            ? [0, 1, 2].map((i) => <Skeleton key={i} width={260} height={72} radius={16} />)
            : (articles.data ?? []).map((a) => (
                <Link role="listitem" key={a.id} href={`/app/articles/${a.slug}`} className={s.article}>
                  <span className={`${s.articleArt} ${c.tone}`} data-tone={a.cover} aria-hidden>
                    <TopicArt topic={a.topic} />
                  </span>
                  <span className={s.articleText}>
                    <strong>{a.title}</strong>
                    <span>{a.reading_minutes} мин</span>
                  </span>
                </Link>
              ))}
        </div>
        {(practices.data ?? []).length > 0 && (
          <div className={s.chips}>
            {(practices.data ?? []).map((p) => (
              <Link key={p.id} href={`/app/practices/${p.slug}`} className={s.practice}>
                <span className={`${s.practiceArt} ${c.tone}`} data-tone={p.cover} aria-hidden>
                  <TopicArt topic={p.kind} />
                </span>
                {p.title}
                <span className={s.practiceMin}>{p.duration_minutes} мин</span>
              </Link>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function Section({ title, href, children }: { title: string; href: string; children: ReactNode }) {
  return (
    <section className={s.section}>
      <div className={s.sectionHead}>
        <h2 className={s.sectionTitle}>{title}</h2>
        <Link href={href} className={s.seeAll} aria-label={`${title}: все`}>
          Все
          <ChevronRight size={16} strokeWidth={2} aria-hidden />
        </Link>
      </div>
      {children}
    </section>
  );
}

function Chip({ href, icon, children }: { href: string; icon: ReactNode; children: ReactNode }) {
  return (
    <Link href={href} className={s.chip}>
      {icon}
      {children}
    </Link>
  );
}
