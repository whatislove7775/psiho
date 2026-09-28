"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronRight, Plus, Users } from "lucide-react";
import { Badge, Button, Card, CollapsibleCard, EmptyState, Skeleton, useToast } from "@/ui";
import { ApiError } from "@/lib/api/client";
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
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const respond = async (id: string, accept: boolean) => {
    setBusy(id);
    try {
      await circlesApi.cohostRespond(id, accept);
      toast(accept ? "Вы ко-терапевт этого круга" : "Приглашение отклонено");
      list.reload();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Не получилось.", { error: true });
    } finally {
      setBusy(null);
    }
  };
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
      {list.data?.invites.map((c) => (
        <div key={c.id} className={`${s.proRow} ${topicClass(c.topic)}`}>
          <span className={s.proIcon}>
            <Users size={20} />
          </span>
          <span style={{ minWidth: 0 }}>
            <h3>{c.title}</h3>
            <span className={s.metaRow}>
              <span>{c.host.name} приглашает вас ко-терапевтом</span>
              <span>{meetingsLine(c)}</span>
              <span>ваша доля {c.share_percent}&nbsp;%</span>
            </span>
          </span>
          <span className={s.rowActions}>
            <Button size="sm" variant="ghost" disabled={busy === c.id} onClick={() => respond(c.id, false)}>
              Отклонить
            </Button>
            <Button size="sm" variant="primary" loading={busy === c.id} onClick={() => respond(c.id, true)}>
              Принять
            </Button>
          </span>
        </div>
      ))}
      {list.loading && !list.data && <Skeleton height={120} radius={22} />}
      {list.data && list.data.results.length === 0 && (
        <Card>
          <EmptyState
            art={<EmptyArt scene="cozy" />}
            title="У&nbsp;вас пока нет кругов"
            text="Перед публикацией команда проверит описание и&nbsp;расписание."
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
                {c.my_role === "cohost" && <Badge tone="lilac">Ко-терапевт</Badge>}
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
      <CollapsibleCard title="Как&nbsp;это&nbsp;работает" defaultOpen={false}>
        <p className={s.note}>
          Вы&nbsp;создаёте черновик и&nbsp;отправляете его на&nbsp;проверку. После одобрения круг появляется в&nbsp;каталоге, и&nbsp;клиенты записываются: оплата
          замораживается на&nbsp;их&nbsp;балансе и&nbsp;списывается после каждой встречи (или&nbsp;после первой, если цена за&nbsp;цикл). Если вы&nbsp;не&nbsp;придёте на&nbsp;встречу, деньги вернутся участникам. Встречи проходят в&nbsp;групповой комнате прямо на&nbsp;сайте: вы&nbsp;с&nbsp;камерой, участники&nbsp;— в&nbsp;аватарах и&nbsp;с&nbsp;маской голоса.
        </p>
      </CollapsibleCard>
    </div>
  );
}
