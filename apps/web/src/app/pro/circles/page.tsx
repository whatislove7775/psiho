"use client";

import { t, tj } from "@/lib/i18n";
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
      toast(accept ? t("Вы ко-терапевт этого круга") : t("Приглашение отклонено"));
      list.reload();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t("Не получилось."), { error: true });
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className={s.page}>
      <PageHeader
        title={t("Круги")}
        action={
          <Button variant="primary" href="/pro/circles/new" icon={<Plus size={18} />}>
            {t("Новый круг")}
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
              <span>{tj("{name} приглашает вас ко-терапевтом", { name: c.host.name })}</span>
              <span>{meetingsLine(c)}</span>
              <span>{tj("ваша доля {share_percent}\u00a0%", { share_percent: c.share_percent })}</span>
            </span>
          </span>
          <span className={s.rowActions}>
            <Button size="sm" variant="ghost" disabled={busy === c.id} onClick={() => respond(c.id, false)}>
              {t("Отклонить")}
            </Button>
            <Button size="sm" variant="primary" loading={busy === c.id} onClick={() => respond(c.id, true)}>
              {t("Принять")}
            </Button>
          </span>
        </div>
      ))}
      {list.loading && !list.data && <Skeleton height={120} radius={22} />}
      {list.data && list.data.results.length === 0 && (
        <Card>
          <EmptyState
            art={<EmptyArt scene="cozy" />}
            title={t("У\u00a0вас пока нет кругов")}
            text={t("Перед публикацией команда проверит описание и\u00a0расписание.")}
            action={
              <Button variant="primary" href="/pro/circles/new">
                {t("Создать круг")}
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
                      {tj("Ближайшая {dayShort}, {time}", { dayShort: dayShort(c.next_meeting_at), time: time(c.next_meeting_at) })}
                    </span>
                  )}
                  <span>{priceLine(c)}</span>
                </span>
              </span>
              <span className={s.rowActions}>
                {c.my_role === "cohost" && <Badge tone="lilac">{t("Ко-терапевт")}</Badge>}
                <Badge tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</Badge>
                <Badge>
                  {c.members_count}{" "}{t("из")}{" "}{c.capacity}
                  {c.waitlist_count ? t(`, ждут {waitlist_count}`, { waitlist_count: c.waitlist_count }) : ""}
                </Badge>
                <ChevronRight size={18} aria-hidden />
              </span>
            </Link>
          ))}
        </div>
      )}
      <CollapsibleCard title={t("Как\u00a0это\u00a0работает")} defaultOpen={false}>
        <p className={s.note}>
          {t("Вы\u00a0создаёте черновик и\u00a0отправляете его на\u00a0проверку. После одобрения круг появляется в\u00a0каталоге, и\u00a0клиенты записываются: оплата замораживается на\u00a0их\u00a0балансе и\u00a0списывается после каждой встречи (или\u00a0после первой, если цена за\u00a0цикл). Если вы\u00a0не\u00a0придёте на\u00a0встречу, деньги вернутся участникам. Встречи проходят в\u00a0групповой комнате прямо на\u00a0сайте: вы\u00a0с\u00a0камерой, участники\u00a0— в\u00a0аватарах и\u00a0с\u00a0маской голоса.")}
        </p>
      </CollapsibleCard>
    </div>
  );
}
