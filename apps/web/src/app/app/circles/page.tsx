"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, CalendarClock, Hourglass } from "lucide-react";
import { Badge, Card, CardHead, EmptyState, Skeleton } from "@/ui";
import { PageHeader } from "@/components/shell/AppShell";
import { useLoad } from "@/components/client/useLoad";
import { ErrorBlock } from "@/components/client/ClientBits";
import { AnonymityBanner, CircleCardView, TopicChips, topicClass } from "@/components/circles/bits";
import { EmptyArt } from "@/components/illustrations";
import { AvatarThumb } from "@/components/avatar/AvatarThumb";
import { circlesApi } from "@/lib/api/circles";
import { dayLabel, time, untilLabel } from "@/lib/format";
import s from "@/components/circles/circles.module.css";

export default function CirclesPage() {
  const [topic, setTopic] = useState("");
  const list = useLoad(() => circlesApi.list(topic || undefined), [topic]);
  const mine = useLoad(() => circlesApi.mine(), []);
  const [topics, setTopics] = useState<{ id: import("@/lib/api/circles").CircleTopic; label: string; count: number }[]>([]);
  useEffect(() => {
    if (list.data && !topic) setTopics(list.data.topics);
  }, [list.data, topic]);

  return (
    <>
      <PageHeader
        title="Круги"
        sub="Небольшие группы поддержки на 5–8 человек с психологом. Встречи раз в неделю по одной теме, в кругу тех, кто понимает."
      />
      <AnonymityBanner />

      {mine.data && mine.data.results.length > 0 && (
        <Card>
          <CardHead title="Мои круги" icon={<CalendarClock size={18} />} />
          <div className={s.mineStrip}>
            {mine.data.results.map((c) => (
              <Link key={c.id} href={`/app/circles/${c.id}`} className={`${s.mineItem} ${topicClass(c.topic)}`}>
                <AvatarThumb config={null} seed={c.me.pseudonym + c.id} size={42} />
                <span className={s.mineText}>
                  <b>{c.title}</b>
                  <small>
                    {c.me.status === "waitlist"
                      ? `Лист ожидания, вы ${c.me.waitlist_position}-й`
                      : c.next_meeting
                        ? `${dayLabel(c.next_meeting.starts_at)} в ${time(c.next_meeting.starts_at)}, ${untilLabel(c.next_meeting.starts_at)}`
                        : "Встреч больше нет"}
                  </small>
                </span>
                {c.me.status === "waitlist" ? (
                  <Badge tone="warning">
                    <Hourglass size={12} /> Ожидание
                  </Badge>
                ) : c.next_meeting?.room_open ? (
                  <Badge tone="success" dot>
                    Встреча идёт
                  </Badge>
                ) : (
                  <ArrowRight size={18} aria-hidden />
                )}
              </Link>
            ))}
          </div>
        </Card>
      )}

      <TopicChips value={topic} onChange={setTopic} topics={topics} />

      {list.error && <ErrorBlock message={list.error} onRetry={list.reload} />}
      {list.loading && !list.data && (
        <div className={s.grid}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={330} radius={22} />
          ))}
        </div>
      )}
      {list.data && list.data.results.length === 0 && (
        <Card>
          <EmptyState
            art={<EmptyArt scene="search" />}
            title={topic ? "По этой теме пока нет кругов" : "Круги скоро появятся"}
            text="Психологи готовят новые группы. Загляните через несколько дней или выберите другую тему."
          />
        </Card>
      )}
      {list.data && list.data.results.length > 0 && (
        <div className={s.grid}>
          {list.data.results.map((c) => (
            <CircleCardView key={c.id} c={c} />
          ))}
        </div>
      )}
    </>
  );
}
