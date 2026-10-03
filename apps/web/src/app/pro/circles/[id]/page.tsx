"use client";

import { t, tj } from "@/lib/i18n";
import Link from "next/link";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  MessageSquareOff,
  MessagesSquare,
  Pencil,
  Send,
  Trash2,
  UserMinus,
  Users,
  Video,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardHead,
  Modal,
  Skeleton,
  Textarea,
  useToast,
} from "@/ui";
import { PageHeader, WithRail } from "@/components/shell/AppShell";
import { useLoad } from "@/components/client/useLoad";
import { LoadError } from "@/components/pro/controls";
import { AvatarThumb } from "@/components/avatar/AvatarThumb";
import { GroupChat } from "@/components/circles/GroupChat";
import { ProCircleForm } from "@/components/circles/ProCircleForm";
import { CohostCard } from "@/components/circles/CohostCard";
import {
  SeatsMeter,
  cx,
  meetingsLine,
  topicClass,
} from "@/components/circles/bits";
import { ApiError } from "@/lib/api/client";
import {
  STATUS_LABEL,
  STATUS_TONE,
  circlesApi,
  priceLine,
  rubK0,
  type CircleMember,
  type OwnerCircle,
} from "@/lib/api/circles";
import { dayLabel, dayShort, time, untilLabel } from "@/lib/format";
import s from "@/components/circles/circles.module.css";
import { typo } from "@/lib/typography";

export default function ProCirclePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const res = useLoad(() => circlesApi.proGet(id), [id]);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [removing, setRemoving] = useState<CircleMember | null>(null);
  const c = res.data;

  if (res.error) return <LoadError text={res.error} onRetry={res.reload} />;
  if (!c) return <Skeleton height={400} radius={28} />;

  const act = async (fn: () => Promise<OwnerCircle>, done: string) => {
    setBusy(true);
    try {
      res.setData(await fn());
      toast(done);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t("Не\u00a0получилось."), {
        error: true,
      });
    } finally {
      setBusy(false);
    }
  };

  const moderate = async (
    m: CircleMember,
    action: "mute" | "unmute" | "remove",
  ) => {
    try {
      const r = await circlesApi.proModerate(c.id, m.handle, action);
      res.setData({
        ...c,
        members: r.members,
        seats_taken: r.members.length,
        seats_left: c.capacity - r.members.length,
      });
      toast(
        action === "remove"
          ? t(`{name} больше не\u00a0в\u00a0круге`, { name: m.name })
          : action === "mute"
            ? t(`{name} не\u00a0может писать в\u00a0чат`, { name: m.name })
            : t(`{name} снова может писать`, { name: m.name }),
      );
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t("Не\u00a0получилось."), {
        error: true,
      });
    }
  };

  const next = c.meetings.find(
    (m) =>
      m.status === "live" ||
      (m.status === "scheduled" && Date.parse(m.ends_at) > Date.now()),
  );
  const published = ["recruiting", "running"].includes(c.status);
  const openSoon =
    next &&
    (next.room_open || Date.parse(next.starts_at) - Date.now() < 10 * 60_000);
  const lead = c.my_role !== "cohost";

  return (
    <div className={topicClass(c.topic)} style={{ display: "contents" }}>
      <Link href="/pro/circles" className={s.hostLink} style={{ marginTop: 0 }}>
        <ArrowLeft size={16} style={{ marginRight: 6 }} />{" "}{t("Все мои круги")}
      </Link>
      <PageHeader
        title={c.title}
        sub={
          <>
            <Badge tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</Badge>{" "}
            {c.topic_label}, {meetingsLine(c).toLowerCase()}, {priceLine(c)}
          </>
        }
        action={
          lead && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {c.editable && (
                <Button
                  variant="primary"
                  loading={busy}
                  icon={<Send size={16} />}
                  onClick={() =>
                    act(
                      () => circlesApi.proAction(c.id, "submit"),
                      t("Круг отправлен на\u00a0проверку"),
                    )
                  }
                >
                  {t("Отправить на\u00a0проверку")}
                </Button>
              )}
              <Button
                variant="secondary"
                icon={<Pencil size={16} />}
                onClick={() => setEditing(true)}
                disabled={!c.editable && !published && c.status !== "pending"}
              >
                {t("Изменить")}
              </Button>
              {c.editable ? (
                <Button
                  variant="ghost"
                  icon={<Trash2 size={16} />}
                  onClick={async () => {
                    await circlesApi.proDelete(c.id).catch(() => undefined);
                    router.push("/pro/circles");
                  }}
                >
                  {t("Удалить")}
                </Button>
              ) : (
                (c.status === "recruiting" || c.status === "pending") && (
                  <Button
                    variant="ghost"
                    onClick={() =>
                      c.status === "pending"
                        ? act(
                            () => circlesApi.proAction(c.id, "cancel"),
                            t("Круг снят с\u00a0проверки"),
                          )
                        : setCancelOpen(true)
                    }
                  >
                    {c.status === "pending"
                      ? t("Вернуть в\u00a0черновик")
                      : t("Отменить круг")}
                  </Button>
                )
              )}
            </div>
          )
        }
      />
      {c.status === "rejected" && c.review_comment && (
        <div className={s.reviewNote}>
          <b>{t("Команда Aprosop просит поправить:")}</b> {c.review_comment}
        </div>
      )}
      {c.status === "pending" && (
        <p className={s.note}>
          {t("Круг на\u00a0проверке. Обычно это\u00a0занимает до\u00a0одного рабочего дня\u00a0— после одобрения он\u00a0появится в\u00a0каталоге.")}
        </p>
      )}

      <WithRail
        rail={
          <>
            <Card>
              <CardHead title={t("Места")} icon={<Users size={18} />} />
              <SeatsMeter capacity={c.capacity} taken={c.seats_taken} />
              <dl className={s.kv} style={{ marginTop: 12 }}>
                <dt>{t("Лист ожидания")}</dt>
                <dd>{c.waitlist_count}</dd>
                <dt>{t("Цена")}</dt>
                <dd>{priceLine(c)}</dd>
                <dt>{t("С\u00a0одного участника")}</dt>
                <dd>{rubK0(c.total_kopecks)}</dd>
              </dl>
            </Card>
            <Card tone="minor">
              <CardHead title={t("Анонимность участников")} />
              <p className={s.note}>
                {t("Вы\u00a0видите участников только под\u00a0псевдонимами этого круга. Их\u00a0аккаунты, лица и\u00a0настоящие голоса скрыты\u00a0— так\u00a0же, как\u00a0друг от\u00a0друга.")}
                {c.allow_real_faces
                  ? t(" Вы\u00a0разрешили показывать лицо: каждый решает сам.")
                  : ""}
              </p>
            </Card>
          </>
        }
      >
        {editing ? (
          <Card>
            <CardHead
              title={t("Редактирование")}
              action={
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditing(false)}
                >
                  {t("Закрыть")}
                </Button>
              }
            />
            <ProCircleForm
              initial={c}
              saving={saving}
              onSave={async (body) => {
                setSaving(true);
                try {
                  res.setData(await circlesApi.proUpdate(c.id, body));
                  setEditing(false);
                  toast(t("Сохранено"));
                } finally {
                  setSaving(false);
                }
              }}
            />
          </Card>
        ) : null}

        {published && next && (
          <Card tone="accent">
            <div className={s.nextMeeting}>
              <div>
                <Badge tone="neutral">{tj("Встреча {index}", { index: next.index })}</Badge>
                <h2 style={{ marginTop: 10 }}>
                  {tj("{dayLabel} в {time}", { dayLabel: dayLabel(next.starts_at), time: time(next.starts_at) })}
                </h2>
                <p>
                  {openSoon
                    ? t("Комната открыта\u00a0— участники могут входить")
                    : t(`Начнётся {untilLabel}. Комната откроется за\u00a010\u00a0минут.`, { untilLabel: untilLabel(next.starts_at) })}
                </p>
              </div>
              <Button
                variant="white"
                size="lg"
                href={openSoon ? `/circle-room/${next.id}` : undefined}
                disabled={!openSoon}
                icon={<Video size={18} />}
              >
                {t("Начать встречу")}
              </Button>
            </div>
          </Card>
        )}

        {lead && c.status !== "draft" && c.status !== "rejected" && (
          <CohostCard c={c} onChange={res.setData} />
        )}
        {!lead && (
          <p className={s.note}>
            {tj("Вы\u00a0ко-терапевт: ведёте встречи вместе с\u00a0{name}, модерируете чат и\u00a0комнаты. Ваша доля\u00a0— {v}\u00a0% от\u00a0заработка за\u00a0каждую встречу.", { name: c.host.name, v: c.cohost_invite?.share_percent ?? 0 })}
          </p>
        )}

        {published && (
          <Card>
            <CardHead
              title={t("Участники")}
              icon={<Users size={18} />}
              sub={t("Только псевдонимы этого круга")}
            />
            {c.members && c.members.length > 0 ? (
              <ul className={s.members}>
                {c.members.map((m) => (
                  <li key={m.handle}>
                    <AvatarThumb config={null} seed={m.handle} size={36} />
                    <span className="grow" style={{ flex: 1, minWidth: 0 }}>
                      {m.name}
                      {m.chat_muted && (
                        <small>{t("Не\u00a0может писать в\u00a0чат")}</small>
                      )}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<MessageSquareOff size={15} />}
                      onClick={() =>
                        moderate(m, m.chat_muted ? "unmute" : "mute")
                      }
                    >
                      {m.chat_muted ? t("Вернуть чат") : t("Выключить чат")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      iconOnly
                      aria-label={t(`Удалить {name}`, { name: m.name })}
                      onClick={() => setRemoving(m)}
                      icon={<UserMinus size={16} />}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <p className={s.note}>
                {t("Пока никто не\u00a0записался. Как\u00a0только появятся участники, они будут здесь.")}
              </p>
            )}
          </Card>
        )}

        {(published || c.status === "finished") && (
          <Card>
            <CardHead
              title={t("Чат круга")}
              icon={<MessagesSquare size={18} />}
              sub={t("Участники видят ваше имя, а\u00a0друг друга\u00a0— по\u00a0псевдонимам")}
            />
            <GroupChat
              circleId={c.id}
              hostPhoto={c.host.photo_url}
              cohostPhoto={c.cohost?.photo_url}
            />
          </Card>
        )}

        <Card>
          <CardHead title={t("Расписание")} icon={<CalendarDays size={18} />} />
          <ol className={s.schedule}>
            {c.meetings.map((m) => (
              <li
                key={m.id}
                className={cx(
                  m.id === next?.id && s.schedNext,
                  (m.status === "done" || m.status === "missed") && s.schedPast,
                )}
              >
                <span className={s.schedNum}>{m.index}</span>
                <span className={s.schedWhen}>
                  {dayShort(m.starts_at)}, {time(m.starts_at)}–{time(m.ends_at)}
                  {m.status === "missed" && (
                    <small>{t("Не\u00a0состоялась: участникам вернули деньги")}</small>
                  )}
                </span>
                {m.status === "done" ? (
                  <Badge>{t("Прошла")}</Badge>
                ) : m.status === "live" ? (
                  <Badge tone="success">{t("Идёт")}</Badge>
                ) : null}
              </li>
            ))}
          </ol>
        </Card>

        {!editing && (
          <Card tone="minor">
            <CardHead title={t("Описание и\u00a0правила")} />
            <p className={s.heroLead}>{typo(c.description)}</p>
            <ul className={s.rules} style={{ marginTop: 12 }}>
              {c.rules.map((r) => (
                <li key={r}>• {r}</li>
              ))}
            </ul>
          </Card>
        )}
      </WithRail>

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title={t("Отменить круг?")}
      >
        <div className={s.joinBox}>
          <p className={s.note}>
            {t("Все участники получат полный возврат на\u00a0баланс, а\u00a0круг исчезнет из\u00a0каталога. Отменить отмену нельзя.")}
          </p>
          <Textarea
            label={t("Причина для\u00a0участников")}
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={() => setCancelOpen(false)}>
              {t("Не\u00a0отменять")}
            </Button>
            <Button
              variant="danger"
              loading={busy}
              onClick={async () => {
                await act(
                  () => circlesApi.proAction(c.id, "cancel", reason),
                  t("Круг отменён, деньги вернулись участникам"),
                );
                setCancelOpen(false);
              }}
            >
              {t("Отменить круг")}
            </Button>
          </div>
        </div>
      </Modal>
      <Modal
        open={!!removing}
        onClose={() => setRemoving(null)}
        title={t("Удалить участника из\u00a0круга?")}
      >
        <div className={s.joinBox}>
          <p className={s.note}>
            {tj("{name} больше не\u00a0сможет заходить на\u00a0встречи и\u00a0писать в\u00a0чат. Деньги за\u00a0будущие встречи вернутся ему полностью. Используйте, если участник нарушает правила круга.", { name: removing?.name })}
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={() => setRemoving(null)}>
              {t("Оставить")}
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (removing) await moderate(removing, "remove");
                setRemoving(null);
              }}
            >
              {t("Удалить")}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
