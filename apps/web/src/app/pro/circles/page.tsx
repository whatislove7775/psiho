"use client";

import Link from "next/link";
import { ChevronRight, Plus, Users } from "lucide-react";
import { Badge, Button, Card, CollapsibleCard, EmptyState, Skeleton } from "@/ui";
import { PageHeader } from "@/components/shell/AppShell";
import { useLoad } from "@/components/client/useLoad";
import { LoadError } from "@/components/pro/controls";
import { EmptyArt } from "@/components/illustrations";
import { meetingsLine, topicClass } from "@/components/circles/bits";
import { STATUS_LABEL, STATUS_TONE, circlesApi, priceLine } from "@/lib/api/circles";
import { dayShort, time } from "@/lib/format";
import s from "@/components/circles/circles.module.css";

export default function ProCirclesPage() {
  const list = useLoad(() => circlesApi.proList(), []);
  return (
    <div className={s.page}>
      <PageHeader
        title="Круги"
        action={
          <Button variant="primary" href="/pro/circles/new" icon={<Plus size={18} />}>
            Новый круг
          </Button>
        }
      />
      {list.error && <LoadError text={list.error} onRetry={list.reload} />}
      {list.loading && !list.data && <Skeleton height={120} radius={22} />}
      {list.data && list.data.results.length === 0 && (
        <Card>
          <EmptyState
            art={<EmptyArt scene="cozy" />}
            title="У вас пока нет кругов"
            text="Перед публикацией команда проверит описание и расписание."
            action={
              <Button variant="primary" href="/pro/circles/new">
                Создать круг
              </Button>
            }
          />
        </Card>
      )}
      {list.data && list.data.results.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {list.data.results.map((c) => (
            <Link key={c.id} href={`/pro/circles/${c.id}`} className={`${s.proRow} ${topicClass(c.topic)}`}>
              <span className={s.proIcon}>
                <Users size={20} />
              </span>
              <span style={{ minWidth: 0 }}>
                <h3>{c.title}</h3>
                <span className={s.metaRow}>
                  <span>{c.topic_label}</span>
                  <span>{meetingsLine(c)}</span>
                  {c.next_meeting_at && (
                    <span>
                      Ближайшая {dayShort(c.next_meeting_at)}, {time(c.next_meeting_at)}
                    </span>
                  )}
                  <span>{priceLine(c)}</span>
                </span>
              </span>
              <span className={s.rowActions}>
                <Badge tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</Badge>
                <Badge>
                  {c.members_count} из {c.capacity}
                  {c.waitlist_count ? `, ждут ${c.waitlist_count}` : ""}
                </Badge>
                <ChevronRight size={18} aria-hidden />
              </span>
            </Link>
          ))}
        </div>
      )}
      <CollapsibleCard title="Как это работает" defaultOpen={false}>
        <p className={s.note}>
          Вы создаёте черновик и отправляете его на проверку. После одобрения круг появляется в каталоге, и клиенты записываются: оплата
          замораживается на их балансе и списывается после каждой встречи (или после первой, если цена за цикл). Если вы не придёте на
          встречу, деньги вернутся участникам. Встречи проходят в групповой комнате прямо на сайте: вы с камерой, участники — в аватарах и с
          маской голоса.
        </p>
      </CollapsibleCard>
    </div>
  );
}
