"use client";

import { useCallback, useEffect, useState } from "react";
import { Flag, MessageSquare, UserRound, Video } from "lucide-react";
import { Badge, Button, Card, EmptyState, Modal, Segmented, Skeleton, Textarea, useToast } from "@/ui";
import { PageHeader } from "@/components/shell/AppShell";
import { AvatarThumb } from "@/components/avatar/AvatarThumb";
import { RequirePerm, useStaff } from "@/components/admin/AdminShell";
import { ago, dateTime, Pager } from "@/components/admin/kit";
import { LoadError } from "@/components/pro/controls";
import { staffApi, type Page, type ReportAction, type ReportStatus, type StaffReport } from "@/lib/api/staff";
import { SESSION_STATUS } from "@/lib/format";
import s from "@/components/admin/staff.module.css";

type Tab = "active" | "resolved" | "dismissed";

const STATUS_TONE: Record<ReportStatus, "warning" | "primary" | "success" | "neutral"> = {
  open: "warning",
  in_review: "primary",
  resolved: "success",
  dismissed: "neutral",
};

const ACTION_LABEL: Record<ReportAction, string> = {
  none: "Без мер",
  warn: "Предупреждение",
  block_user: "Заблокировать аккаунт",
  suspend_specialist: "Приостановить специалиста",
  cancel_session: "Отменить сессию",
};

const TARGET_ICON = { user: UserRound, specialist: UserRound, session: Video, message: MessageSquare };
const TARGET_LABEL = { user: "Аккаунт", specialist: "Специалист", session: "Сессия", message: "Сообщение в чате" };

export default function Page_() {
  return (
    <RequirePerm perm="reports.view">
      <ModerationPage />
    </RequirePerm>
  );
}

function ModerationPage() {
  const { can, me } = useStaff();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("active");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<(Page<StaffReport> & { counts: Record<ReportStatus, number> }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState<StaffReport | null>(null);

  const load = useCallback(() => {
    setError(null);
    staffApi
      .reports({ status: tab, page })
      .then(setData)
      .catch((e) => setError(`${(e as Error).message} Попробуйте ещё раз.`));
  }, [tab, page]);
  useEffect(load, [load]);

  const take = async (r: StaffReport) => {
    try {
      await staffApi.assignReport(r.id);
      toast(`Жалоба №${r.id} у вас в работе`);
      load();
    } catch (e) {
      toast((e as Error).message, { error: true });
    }
  };

  const c = data?.counts;
  return (
    <>
      <PageHeader
        title="Жалобы"
        sub="Клиенты и специалисты жалуются на аккаунты, сессии и сообщения. Текст переписки команде не виден: решайте по описанию и истории."
      />
      <div className={s.tabsRow}>
        <Segmented<Tab>
          ariaLabel="Статус жалоб"
          value={tab}
          onChange={(t) => {
            setTab(t);
            setPage(1);
            setData(null);
          }}
          options={[
            { value: "active", label: c ? `Открытые ${c.open + c.in_review}` : "Открытые" },
            { value: "resolved", label: "Решённые" },
            { value: "dismissed", label: "Отклонённые" },
          ]}
        />
      </div>
      {error && <LoadError text={error} onRetry={load} />}
      {!data ? (
        <div className={s.cards}>
          {[0, 1].map((i) => (
            <Skeleton key={i} height={180} radius={22} />
          ))}
        </div>
      ) : data.results.length ? (
        <div className={s.cards}>
          {data.results.map((r) => {
            const Icon = TARGET_ICON[r.target_type];
            const u = r.target.user;
            return (
              <Card as="article" key={r.id}>
                <div className={s.reportHead}>
                  <span className={s.reportKind}>
                    <Icon size={18} /> {TARGET_LABEL[r.target_type]}
                  </span>
                  <Badge tone={STATUS_TONE[r.status]}>{r.status_label}</Badge>
                  <span className={s.muted}>
                    №{r.id}, {ago(r.created_at)}
                  </span>
                </div>
                <div className={s.reportBody}>
                  <div className={s.reportTarget}>
                    {u ? (
                      <>
                        <AvatarThumb config={u.avatar_config} seed={u.id} size={40} />
                        <div>
                          <div className={s.rowTitle}>
                            {r.target.specialist?.display_name ?? u.alias}
                            {!u.is_active && <Badge tone="danger">Заблокирован</Badge>}
                          </div>
                          <div className={s.rowSub}>
                            {r.target.specialist ? `Специалист, аккаунт ${u.alias}` : u.role === "client" ? "Клиент" : "Аккаунт"}
                            {r.target_reports_total > 1 ? `, жалоб всего: ${r.target_reports_total}` : ""}
                          </div>
                        </div>
                      </>
                    ) : (
                      <span className={s.muted}>Аккаунт удалён</span>
                    )}
                  </div>
                  <div className={s.reason}>
                    <strong>{r.reason_label}</strong>
                    {r.comment ? <p>{r.comment}</p> : <p className={s.muted}>Без комментария</p>}
                  </div>
                  <div className={s.reportMeta}>
                    <span>От: {r.reporter.alias}</span>
                    {r.target.session && (
                      <span>
                        Сессия {dateTime(r.target.session.scheduled_at)}, {SESSION_STATUS[r.target.session.status]?.label.toLowerCase()}
                      </span>
                    )}
                    {r.target.message_id && <span>Сообщение №{r.target.message_id.slice(0, 8)}</span>}
                    {r.assignee && <span>В работе у {r.assignee === me.alias ? "вас" : r.assignee}</span>}
                  </div>
                  {r.resolved_at && (
                    <div className={s.resolution}>
                      <strong>{r.resolution_action ? ACTION_LABEL[r.resolution_action] : "Решение"}</strong>
                      <span>{r.resolution_note}</span>
                      <span className={s.muted}>
                        {r.resolved_by}, {dateTime(r.resolved_at)}
                      </span>
                    </div>
                  )}
                </div>
                {can("reports.resolve") && (r.status === "open" || r.status === "in_review") && (
                  <div className={s.cardActions}>
                    {r.status === "open" && (
                      <Button variant="ghost" onClick={() => take(r)}>
                        Взять в работу
                      </Button>
                    )}
                    <Button variant="primary" onClick={() => setResolving(r)}>
                      Принять решение
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
          <Card padded={false}>
            <Pager page={data.page} pages={data.pages} count={data.count} onPage={setPage} noun={["жалоба", "жалобы", "жалоб"]} />
          </Card>
        </div>
      ) : (
        <Card>
          <EmptyState
            icon={<Flag size={22} />}
            title={tab === "active" ? "Открытых жалоб нет" : "Здесь пока пусто"}
            text={tab === "active" ? "Когда кто-то нажмёт «Пожаловаться», жалоба появится здесь." : undefined}
          />
        </Card>
      )}
      <ResolveModal
        report={resolving}
        onClose={() => setResolving(null)}
        onDone={() => {
          setResolving(null);
          load();
        }}
      />
    </>
  );
}

function ResolveModal({ report, onClose, onDone }: { report: StaffReport | null; onClose: () => void; onDone: () => void }) {
  const { can } = useStaff();
  const toast = useToast();
  const [status, setStatus] = useState<"resolved" | "dismissed">("resolved");
  const [action, setAction] = useState<ReportAction>("none");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setStatus("resolved");
    setAction("none");
    setNote("");
  }, [report]);

  if (!report) return null;
  const actions: ReportAction[] = ["none", "warn"];
  if (report.target.user && can("users.block")) actions.push("block_user");
  if (report.target.specialist && report.target.specialist.verification_status === "approved" && can("specialists.suspend"))
    actions.push("suspend_specialist");
  if (report.target.session && ["awaiting_payment", "paid", "in_progress"].includes(report.target.session.status) && can("sessions.cancel"))
    actions.push("cancel_session");

  const submit = async () => {
    setBusy(true);
    try {
      await staffApi.resolveReport(report.id, status, status === "dismissed" ? "none" : action, note.trim());
      toast(status === "resolved" ? `Жалоба №${report.id} решена` : `Жалоба №${report.id} отклонена`);
      onDone();
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={() => !busy && onClose()} title={`Жалоба №${report.id}`} width={560}>
      <div className={s.form}>
        <Segmented<"resolved" | "dismissed">
          ariaLabel="Решение"
          value={status}
          onChange={setStatus}
          options={[
            { value: "resolved", label: "Жалоба обоснована" },
            { value: "dismissed", label: "Отклонить" },
          ]}
        />
        {status === "resolved" && (
          <fieldset className={s.choices}>
            <legend>Мера</legend>
            {actions.map((a) => (
              <label key={a} className={s.choice} data-danger={a === "block_user" || a === "suspend_specialist" || undefined}>
                <input type="radio" name="action" checked={action === a} onChange={() => setAction(a)} />
                {ACTION_LABEL[a]}
              </label>
            ))}
          </fieldset>
        )}
        <Textarea
          label="Комментарий к решению"
          hint="Для команды и журнала действий. Минимум 3 символа."
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={1000}
        />
        <div className={s.modalActions}>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Отмена
          </Button>
          <Button
            variant={action === "block_user" || action === "suspend_specialist" ? "danger" : "primary"}
            loading={busy}
            disabled={note.trim().length < 3}
            onClick={submit}
          >
            {status === "dismissed" ? "Отклонить жалобу" : "Сохранить решение"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
