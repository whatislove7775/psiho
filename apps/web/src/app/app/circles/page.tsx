"use client";

import { t as tt } from "@/lib/i18n";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, CalendarClock, Hourglass, Tag } from "lucide-react";
import { Badge, Card, CardHead, EmptyState, Skeleton } from "@/ui";
import { PageHeader } from "@/components/shell/AppShell";
import { useLoad } from "@/components/client/useLoad";
import { ErrorBlock } from "@/components/client/ClientBits";
import { CircleCardView, topicClass } from "@/components/circles/bits";
import { CheckList } from "@/components/search/FilterBar";
import { FilterPopover } from "@/components/search/FilterPopover";
import f from "@/components/search/filters.module.css";
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
    <div className={s.page}>
      <PageHeader
        title={tt("Круги")}
        sub={tt("Группы поддержки до\u00a012\u00a0человек с\u00a0психологом")}
      />

      {mine.data && mine.data.results.length > 0 && (
        <Card>
          <CardHead title={tt("Мои круги")} icon={<CalendarClock size={18} />} />
          <div className={s.mineStrip}>
            {mine.data.results.map((c) => (
              <Link key={c.id} href={`/app/circles/${c.id}`} className={`${s.mineItem} ${topicClass(c.topic)}`}>
                <AvatarThumb config={null} seed={c.me.pseudonym + c.id} size={42} />
                <span className={s.mineText}>
                  <b>{c.title}</b>
                  <small>
                    {c.me.status === "waitlist"
                      ? tt(`Лист ожидания, вы\u00a0{waitlist_position}-й`, { waitlist_position: c.me.waitlist_position })
                      : c.next_meeting
                        ? tt(`{dayLabel} в\u00a0{time}, {untilLabel}`, { dayLabel: dayLabel(c.next_meeting.starts_at), time: time(c.next_meeting.starts_at), untilLabel: untilLabel(c.next_meeting.starts_at) })
                        : tt("Встреч больше нет")}
                  </small>
                </span>
                {c.me.status === "waitlist" ? (
                  <Badge tone="warning">
                    <Hourglass size={12} />{" "}{tt("Ожидание")}
                  </Badge>
                ) : c.next_meeting?.room_open ? (
                  <Badge tone="success" dot>
                    {tt("Встреча идёт")}
                  </Badge>
                ) : (
                  <ArrowRight size={18} aria-hidden />
                )}
              </Link>
            ))}
          </div>
        </Card>
      )}

      {topics.length > 0 && (
        <div className={f.bar}>
          <div className={f.row} role="group" aria-label={tt("Фильтры")}>
            <FilterPopover
              label={topic ? topics.find((t) => t.id === topic)?.label ?? tt("Тема") : tt("Тема")}
              icon={<Tag size={15} strokeWidth={1.9} aria-hidden />}
              active={!!topic}
              title={tt("Тема круга")}
              noun={[tt("круг"), tt("круга"), tt("кругов")]}
              count={list.data ? list.data.results.length : null}
              onReset={() => setTopic("")}
            >
              <CheckList
                options={topics.map((t) => ({ value: t.id, label: t.label, count: t.count }))}
                selected={topic ? [topic] : []}
                onToggle={(v) => setTopic(topic === v ? "" : v)}
              />
            </FilterPopover>
          </div>
        </div>
      )}

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
            title={topic ? tt("По\u00a0этой теме пока нет кругов") : tt("Круги скоро появятся")}
            text={tt("Загляните через несколько дней.")}
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
    </div>
  );
}
