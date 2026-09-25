"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarDays, CircleSlash, Undo2 } from "lucide-react";
import { Badge, Button, Card, EmptyState, Modal, Segmented, Skeleton, useToast } from "@/ui";
import { PageHeader } from "@/components/shell/AppShell";
import { AvatarThumb } from "@/components/avatar/AvatarThumb";
import { RequirePerm, useStaff } from "@/components/admin/AdminShell";
import { dateTime, KV, Pager, ReasonModal, SearchBox, Toolbar, useDebounced } from "@/components/admin/kit";
import { LoadError } from "@/components/pro/controls";
import { staffApi, type Page, type StaffSessionDetail, type StaffSessionRow } from "@/lib/api/staff";
import { dayShort, rub, SESSION_STATUS, time } from "@/lib/format";
import s from "@/components/admin/staff.module.css";

type Filter = "all" | "upcoming" | "completed" | "cancelled";
const STATUS_Q: Record<Filter, string> = {
  all: "",
  upcoming: "awaiting_payment,paid,in_progress",
  completed: "completed",
  cancelled: "cancelled,refunded",
};

const PAYMENT_LABEL: Record<string, string> = {
  pending: "Ожидает оплаты",
  waiting_for_capture: "Ожидает списания",
  succeeded: "Оплачен",
  cancelled: "Отменён",
};

export default function Page_() {
  return (
    <RequirePerm perm="sessions.view">
      <SessionsPage />
    </RequirePerm>
  );
}

function SessionsPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const [data, setData] = useState<Page<StaffSessionRow> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    staffApi
      .sessions({ status: STATUS_Q[filter], q: dq, from, to, page })
      .then(setData)
      .catch((e) => setError(`${(e as Error).message} Попробуйте ещё раз.`));
  }, [filter, dq, from, to, page]);
  useEffect(load, [load]);
  useEffect(() => setPage(1), [filter, dq, from, to]);

  return (
    <>
      <PageHeader title="Сессии" sub="Все записи клиентов. Содержание сессий не хранится: видны только время, статус и оплата." />
      <div className={s.tabsRow}>
        <Segmented<Filter>
          ariaLabel="Статус сессий"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "Все" },
            { value: "upcoming", label: "Предстоящие" },
            { value: "completed", label: "Завершены" },
            { value: "cancelled", label: "Отменены" },
          ]}
        />
      </div>
      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="Псевдоним клиента, специалист или ID" label="Поиск сессии" />
        <label className={s.dateField}>
          <span>С</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="С даты" />
        </label>
        <label className={s.dateField}>
          <span>По</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="По дату" />
        </label>
      </Toolbar>
      {error && <LoadError text={error} onRetry={load} />}
      <Card as="section" padded={false}>
        {!data ? (
          <div className={s.listPad}>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} height={56} radius={16} />
            ))}
          </div>
        ) : data.results.length ? (
          <>
            <div className={s.rows} role="list">
              {data.results.map((x) => {
                const st = SESSION_STATUS[x.status] ?? { label: x.status, tone: "neutral" as const };
                return (
                  <button key={x.id} type="button" role="listitem" className={`${s.rowBtn} ${s.sessionRow}`} onClick={() => setOpenId(x.id)}>
                    <span className={s.when}>
                      <strong>{dayShort(x.scheduled_at)}</strong>
                      <span>
                        {time(x.scheduled_at)}, {x.duration_minutes} мин
                      </span>
                    </span>
                    <span className={s.pair}>
                      <span>{x.specialist.display_name}</span>
                      <span className={s.muted}>{x.client.alias}</span>
                    </span>
                    <span className={s.rowMeta}>
                      <Badge tone={st.tone}>{st.label}</Badge>
                      <span className={s.amount}>{rub(x.amount_rub)}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <Pager page={data.page} pages={data.pages} count={data.count} onPage={setPage} noun={["сессия", "сессии", "сессий"]} />
          </>
        ) : (
          <EmptyState icon={<CalendarDays size={22} />} title="Сессий не нашли" text="Измените фильтры или период." />
        )}
      </Card>
      <SessionModal id={openId} onClose={() => setOpenId(null)} onChanged={load} />
    </>
  );
}

function SessionModal({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  const { can } = useStaff();
  const toast = useToast();
  const [x, setX] = useState<StaffSessionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"cancel" | "refund" | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setX(null);
    setError(null);
    if (id)
      staffApi
        .session(id)
        .then(setX)
        .catch((e) => setError((e as Error).message));
  }, [id]);

  const act = async (reason: string) => {
    if (!x || !dialog) return;
    setBusy(true);
    try {
      setX(await staffApi.cancelSession(x.id, reason, dialog === "refund"));
      toast(dialog === "refund" ? "Возврат оформлен" : "Сессия отменена");
      setDialog(null);
      onChanged();
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(false);
    }
  };

  const cancellable = x && ["awaiting_payment", "paid", "in_progress"].includes(x.status);
  const refundable =
    x && ["paid", "in_progress", "completed", "cancelled"].includes(x.status) && !x.payment?.refunded_at;
  const st = x ? SESSION_STATUS[x.status] ?? { label: x.status, tone: "neutral" as const } : null;

  return (
    <>
      <Modal open={!!id && !dialog} onClose={onClose} title="Сессия" width={620}>
        {error ? (
          <p className={s.errorText}>{error}</p>
        ) : !x || !st ? (
          <Skeleton height={260} />
        ) : (
          <div className={s.detail}>
            <div className={s.detailHead}>
              <AvatarThumb config={x.client.avatar_config} seed={x.client.alias} size={44} />
              <div>
                <div className={s.rowTitle}>
                  {x.client.alias} и {x.specialist.display_name}
                </div>
                <div className={s.rowSub}>
                  {dateTime(x.scheduled_at)}, {x.duration_minutes} минут
                </div>
              </div>
              <Badge tone={st.tone}>{st.label}</Badge>
            </div>
            <KV
              items={[
                ["ID", <code key="id" className={s.code}>{x.id}</code>],
                ["Сумма", rub(x.amount_rub)],
                ...(x.payout_rub !== undefined
                  ? ([
                      ["Специалисту", rub(x.payout_rub)],
                      ["Комиссия", rub(x.platform_fee_rub ?? 0)],
                    ] as [string, string][])
                  : []),
                [
                  "Оплата",
                  x.payment
                    ? `${PAYMENT_LABEL[x.payment.status] ?? x.payment.status}${x.payment.provider ? ", ЮKassa" : ""}${x.payment.refunded_at ? `, возврат ${dateTime(x.payment.refunded_at)}` : ""}`
                    : "Без платёжного сервиса",
                ],
                ["Создана", dateTime(x.created_at)],
                ["Жалобы", x.reports ? <Badge key="r" tone="warning">{x.reports}</Badge> : "Нет"],
              ]}
            />
            <div>
              <h4 className={s.subhead}>События</h4>
              {x.events.length ? (
                <ol className={s.timeline}>
                  {x.events.map((e, i) => (
                    <li key={i}>
                      <span>{e.label}</span>
                      <span className={s.muted}>
                        {dateTime(e.at)}
                        {e.meta.participant_role ? `, ${e.meta.participant_role === "client" ? "клиент" : "специалист"}` : ""}
                        {e.meta.cancelled_by === "staff" ? ", команда сервиса" : ""}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className={s.muted}>Событий пока нет.</p>
              )}
            </div>
            {(cancellable && can("sessions.cancel")) || (refundable && can("sessions.refund")) ? (
              <div className={s.modalActions}>
                {cancellable && can("sessions.cancel") && (
                  <Button variant="secondary" icon={<CircleSlash size={18} />} onClick={() => setDialog("cancel")}>
                    Отменить без возврата
                  </Button>
                )}
                {refundable && can("sessions.refund") && (
                  <Button variant="danger" icon={<Undo2 size={18} />} onClick={() => setDialog("refund")}>
                    {cancellable ? "Отменить и вернуть деньги" : "Вернуть деньги"}
                  </Button>
                )}
              </div>
            ) : null}
          </div>
        )}
      </Modal>
      <ReasonModal
        open={dialog === "cancel"}
        title="Отменить сессию без возврата?"
        text="Слот освободится, клиент и специалист увидят отмену. Деньги останутся у сервиса, вернуть их можно позже."
        confirm="Отменить сессию"
        variant="danger"
        busy={busy}
        onClose={() => setDialog(null)}
        onConfirm={act}
      />
      <ReasonModal
        open={dialog === "refund"}
        title="Вернуть деньги клиенту?"
        text={`${x ? rub(x.amount_rub) : ""} вернутся на карту через ЮKassa, обычно в течение нескольких дней. Действие нельзя отменить.`}
        confirm="Оформить возврат"
        variant="danger"
        busy={busy}
        onClose={() => setDialog(null)}
        onConfirm={act}
      />
    </>
  );
}
