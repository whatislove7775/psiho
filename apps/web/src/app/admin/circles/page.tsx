"use client";

import { useState } from "react";
import { Check, ExternalLink, X } from "lucide-react";
import { Badge, Button, Card, CardHead, EmptyState, Segmented, Skeleton, useToast } from "@/ui";
import { PageHeader, WithRail } from "@/components/shell/AppShell";
import { RequirePerm } from "@/components/admin/AdminShell";
import { KV, ReasonModal, dateTime } from "@/components/admin/kit";
import { LoadError } from "@/components/pro/controls";
import { SpecialistPhoto } from "@/components/avatar/SpecialistPhoto";
import { EmptyArt } from "@/components/illustrations";
import { useLoad } from "@/components/client/useLoad";
import { meetingsLine, topicClass } from "@/components/circles/bits";
import { ApiError } from "@/lib/api/client";
import { STATUS_LABEL, STATUS_TONE, TOPIC_TONE, circlesApi, priceLine, rubK0, type CircleStatus } from "@/lib/api/circles";
import { dayShort, time } from "@/lib/format";
import s from "@/components/circles/circles.module.css";

const TABS: { value: CircleStatus; label: string }[] = [
  { value: "pending", label: "На проверке" },
  { value: "recruiting", label: "Набор" },
  { value: "running", label: "Идут" },
  { value: "rejected", label: "На доработке" },
  { value: "cancelled", label: "Отменены" },
];

export default function Page_() {
  return (
    <RequirePerm perm="specialists.verify">
      <CirclesQueue />
    </RequirePerm>
  );
}

function CirclesQueue() {
  const toast = useToast();
  const [tab, setTab] = useState<CircleStatus>("pending");
  const [openId, setOpenId] = useState<string | null>(null);
  const list = useLoad(() => circlesApi.staffList(tab), [tab]);
  const detail = useLoad(() => (openId ? circlesApi.staffGet(openId) : Promise.resolve(null)), [openId]);
  const [modal, setModal] = useState<null | "reject" | "cancel">(null);
  const [busy, setBusy] = useState(false);

  const decide = async (decision: "approve" | "reject" | "cancel", comment = "") => {
    if (!openId) return;
    setBusy(true);
    try {
      await circlesApi.staffDecide(openId, decision, comment);
      toast(decision === "approve" ? "Круг опубликован" : decision === "reject" ? "Круг возвращён специалисту" : "Круг отменён, деньги вернулись участникам");
      setModal(null);
      setOpenId(null);
      list.reload();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Не получилось.", { error: true });
    } finally {
      setBusy(false);
    }
  };

  const c = detail.data;
  return (
    <>
      <PageHeader title="Круги" sub="Групповые встречи специалистов. Перед публикацией проверьте тему, описание, правила и расписание." />
      <Segmented
        ariaLabel="Статус"
        value={tab}
        onChange={(v) => {
          setTab(v);
          setOpenId(null);
        }}
        options={TABS.map((t) => ({
          value: t.value,
          label: (
            <>
              {t.label}
              {list.data?.counts[t.value] ? ` ${list.data.counts[t.value]}` : ""}
            </>
          ),
        }))}
      />
      <WithRail
        rail={
          c ? (
            <Card className={topicClass(c.topic)}>
              <CardHead title={c.title} sub={`${c.topic_label}, ${meetingsLine(c).toLowerCase()}`} />
              <div className={s.hostCard} style={{ marginBottom: 12 }}>
                <SpecialistPhoto url={c.host.photo_url} name={c.host.name} size={44} />
                <div>
                  <h3>{c.host.name}</h3>
                  <Badge tone={c.host.status === "approved" ? "success" : "warning"}>
                    {c.host.status === "approved" ? "Проверенный специалист" : "Специалист не проверен"}
                  </Badge>
                </div>
              </div>
              <KV
                items={[
                  ["Статус", <Badge key="st" tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</Badge>],
                  ["Цена", priceLine(c)],
                  ["С участника", rubK0(c.total_kopecks)],
                  ["Мест", `${c.seats_taken} из ${c.capacity}`],
                  ["Лицо в звонке", c.allow_real_faces ? "Можно показать" : "Только аватары"],
                  ["Отправлен", dateTime(c.submitted_at)],
                ]}
              />
              <h4 style={{ margin: "16px 0 6px" }}>Описание</h4>
              <p className={s.heroLead} style={{ fontSize: "var(--t-13)" }}>
                {c.description}
              </p>
              <h4 style={{ margin: "16px 0 6px" }}>Правила</h4>
              <ul className={s.rules}>
                {c.rules.map((r) => (
                  <li key={r} style={{ fontSize: "var(--t-13)" }}>
                    • {r}
                  </li>
                ))}
              </ul>
              <h4 style={{ margin: "16px 0 6px" }}>Расписание</h4>
              <ol className={s.schedule}>
                {c.meetings.map((m) => (
                  <li key={m.id} style={{ fontSize: "var(--t-13)" }}>
                    <span className={s.schedNum}>{m.index}</span>
                    <span>
                      {dayShort(m.starts_at)}, {time(m.starts_at)}–{time(m.ends_at)}
                    </span>
                    <span />
                  </li>
                ))}
              </ol>
              {c.review_comment && <p className={s.fine}>Комментарий: {c.review_comment}</p>}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
                {c.status === "pending" && (
                  <>
                    <Button variant="primary" loading={busy} icon={<Check size={16} />} onClick={() => decide("approve")}>
                      Опубликовать
                    </Button>
                    <Button variant="secondary" icon={<X size={16} />} onClick={() => setModal("reject")}>
                      Вернуть на доработку
                    </Button>
                  </>
                )}
                {(c.status === "recruiting" || c.status === "running") && (
                  <>
                    <Button variant="secondary" href={`/app/circles/${c.id}`} icon={<ExternalLink size={16} />}>
                      Страница круга
                    </Button>
                    <Button variant="danger" onClick={() => setModal("cancel")}>
                      Отменить круг
                    </Button>
                  </>
                )}
              </div>
            </Card>
          ) : (
            <Card tone="minor">
              <p className={s.note}>Выберите круг слева, чтобы увидеть описание, правила и расписание. Участников персонал не видит.</p>
            </Card>
          )
        }
      >
        {list.error && <LoadError text={list.error} onRetry={list.reload} />}
        {list.loading && !list.data && <Skeleton height={100} radius={22} />}
        {list.data && list.data.results.length === 0 && (
          <Card>
            <EmptyState art={<EmptyArt scene="calendar" />} title="Здесь пусто" text={tab === "pending" ? "Все круги проверены. Новые заявки появятся здесь." : "Кругов в этом статусе нет."} />
          </Card>
        )}
        {list.data?.results.map((row) => (
          <button
            key={row.id}
            type="button"
            className={`${s.proRow} ${topicClass(row.topic)}`}
            style={{ textAlign: "left", font: "inherit", cursor: "pointer", outline: openId === row.id ? "2px solid var(--c-primary)" : undefined }}
            onClick={() => setOpenId(row.id)}
          >
            <SpecialistPhoto url={row.host.photo_url} name={row.host.name} size={46} />
            <span style={{ minWidth: 0 }}>
              <h3>{row.title}</h3>
              <span className={s.metaRow}>
                <Badge tone={TOPIC_TONE[row.topic]}>{row.topic_label}</Badge>
                <span>{row.host.name}</span>
                <span>{meetingsLine(row)}</span>
                {row.first_meeting_at && <span>Старт {dayShort(row.first_meeting_at)}</span>}
              </span>
            </span>
            <span className={s.rowActions}>
              <Badge>{priceLine(row)}</Badge>
            </span>
          </button>
        ))}
      </WithRail>
      <ReasonModal
        open={modal === "reject"}
        title="Вернуть круг на доработку"
        text="Специалист увидит комментарий и сможет исправить круг и отправить его снова."
        confirm="Вернуть"
        reasonLabel="Что поправить"
        busy={busy}
        onClose={() => setModal(null)}
        onConfirm={(r) => decide("reject", r)}
      />
      <ReasonModal
        open={modal === "cancel"}
        title="Отменить круг?"
        text="Всем участникам вернутся деньги за встречи, которые не состоялись. Круг исчезнет из каталога."
        confirm="Отменить круг"
        variant="danger"
        busy={busy}
        onClose={() => setModal(null)}
        onConfirm={(r) => decide("cancel", r)}
      />
    </>
  );
}
