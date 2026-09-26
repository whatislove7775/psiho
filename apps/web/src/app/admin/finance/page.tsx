"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Copy,
  Download,
  Eye,
  Gift,
  PlusCircle,
  RefreshCw,
  Scale,
  Undo2,
  Wallet,
} from "lucide-react";
import { Badge, Button, Card, CardHead, EmptyState, Input, Modal, Segmented, Skeleton, Stat, useToast } from "@/ui";
import { PageHeader } from "@/components/shell/AppShell";
import { RequirePerm, useStaff } from "@/components/admin/AdminShell";
import { dateTime, KV, ReasonModal, SearchBox, Toolbar, useDebounced } from "@/components/admin/kit";
import { LoadError } from "@/components/pro/controls";
import { EmptyArt } from "@/components/illustrations";
import {
  financeApi,
  rubK,
  type FinanceOverview,
  type GiftBatchRow,
  type Reconcile,
  type StaffBalanceRow,
  type StaffHoldRow,
  type StaffPayoutRow,
  type StaffTopUpRow,
} from "@/lib/api/billing";
import { plural } from "@/lib/format";
import s from "@/components/admin/staff.module.css";

type Tab = "overview" | "payouts" | "calls" | "balances" | "topups" | "gifts" | "reconcile";

export default function FinancePage() {
  return (
    <RequirePerm perm="finance.view">
      <Finance />
    </RequirePerm>
  );
}

function useData<T>(loader: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(null);
    loader()
      .then(setData)
      .catch((e) => setError(`${(e as Error).message} Попробуйте ещё раз.`));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(load, [load]);
  return { data, error, load };
}

function Finance() {
  const [tab, setTab] = useState<Tab>("overview");
  return (
    <>
      <PageHeader
        title="Финансы"
      />
      <div className={s.tabsRow}>
        <Segmented<Tab>
          ariaLabel="Раздел финансов"
          value={tab}
          onChange={setTab}
          options={[
            { value: "overview", label: "Сводка" },
            { value: "payouts", label: "Выплаты" },
            { value: "calls", label: "Созвоны" },
            { value: "balances", label: "Балансы" },
            { value: "topups", label: "Пополнения" },
            { value: "gifts", label: "Коды" },
            { value: "reconcile", label: "Сверка" },
          ]}
        />
      </div>
      {tab === "overview" && <Overview onTab={setTab} />}
      {tab === "payouts" && <Payouts />}
      {tab === "calls" && <Calls />}
      {tab === "balances" && <Balances />}
      {tab === "topups" && <TopUps />}
      {tab === "gifts" && <Gifts />}
      {tab === "reconcile" && <ReconcileTab />}
    </>
  );
}

// ── Сводка ─────────────────────────────────────────────────────────

function Overview({ onTab }: { onTab: (t: Tab) => void }) {
  const { data, error, load } = useData<FinanceOverview>(() => financeApi.overview(), []);
  if (error) return <LoadError text={error} onRetry={load} />;
  if (!data) return <Skeleton height={320} radius={22} />;
  const p = data.provider;
  return (
    <div className={s.stack}>
      {!p.yookassa_live && (
        <div className={s.notice}>
          <AlertTriangle size={18} aria-hidden style={{ flex: "none" }} />
          <span style={{ flex: 1 }}>
            ЮKassa не подключена: работает тестовая касса, настоящие деньги не принимаются. Как подключить — docs/PAYMENTS.md.
          </span>
        </div>
      )}
      <div className={s.cards} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <Stat label="На балансах клиентов" value={<span style={{ whiteSpace: "nowrap" }}>{rubK(data.clients_kopecks)}</span>} />
        <Stat label="Заморожено под созвоны" value={<span style={{ whiteSpace: "nowrap" }}>{rubK(data.holds_kopecks)}</span>} note={`${data.active_holds} ${plural(data.active_holds, "созвон", "созвона", "созвонов")}`} />
        <Stat label="Специалистам: ожидает" value={<span style={{ whiteSpace: "nowrap" }}>{rubK(data.spec_pending_kopecks)}</span>} />
        <Stat label="Специалистам: к выплате" value={<span style={{ whiteSpace: "nowrap" }}>{rubK(data.spec_available_kopecks + data.spec_payout_kopecks)}</span>} note={`${data.open_payouts} ${plural(data.open_payouts, "заявка", "заявки", "заявок")}`} tone={data.open_payouts ? "warning" : undefined} />
        <Stat label="Комиссия сервиса" value={<span style={{ whiteSpace: "nowrap" }}>{rubK(data.platform_fee_kopecks)}</span>} note={`за 30 дней ${rubK(data.fee_month_kopecks)}`} tone="success" />
        <Stat label="Выплачено специалистам" value={<span style={{ whiteSpace: "nowrap" }}>{rubK(data.payouts_sent_kopecks)}</span>} />
        <Stat label="Пополнения ЮKassa" value={<span style={{ whiteSpace: "nowrap" }}>{rubK(data.topups_live_kopecks)}</span>} note={`за 30 дней ${rubK(data.topups_month_kopecks)}`} />
        <Stat label="Тестовые пополнения" value={<span style={{ whiteSpace: "nowrap" }}>{rubK(data.topups_test_kopecks)}</span>} />
        <Stat label="Коды: не погашено" value={<span style={{ whiteSpace: "nowrap" }}>{rubK(data.gifts_outstanding_kopecks)}</span>} note={`погашено ${rubK(data.gifts_redeemed_kopecks)}`} />
      </div>
      <Card as="section">
        <CardHead title="Настройки" icon={<Scale size={18} />} sub="Меняются переменными окружения, см. docs/PAYMENTS.md" />
        <KV
          items={[
            ["Приём денег", p.yookassa_live ? "ЮKassa" : "Тестовая касса"],
            ["Тестовая касса", p.mock_enabled ? "Включена" : "Выключена"],
            ["Выплаты", p.payout_rail === "yookassa" ? "ЮKassa Выплаты" : "Вручную (бухгалтерия)"],
            ["Чеки через ЮKassa", p.receipts_enabled ? "Передаём данные для чека" : "Выключено"],
            ["Комиссия", `${p.fee_percent}%`],
            ["Бесплатная отмена", `за ${p.free_cancel_hours} ч, позже удерживаем ${p.late_cancel_penalty_percent}%`],
            ["Заработок доступен через", `${p.earnings_hold_hours} ч после созвона`],
            [
              "Журнал проводок",
              data.ledger_ok ? (
                <Badge key="ok" tone="success">Сходится</Badge>
              ) : (
                <Button key="bad" size="sm" variant="danger" onClick={() => onTab("reconcile")}>
                  Расхождение, открыть сверку
                </Button>
              ),
            ],
          ]}
        />
      </Card>
    </div>
  );
}

// ── Выплаты ────────────────────────────────────────────────────────

const PAYOUT_STATUS: Record<string, { label: string; tone: "neutral" | "success" | "warning" | "danger" | "primary" }> = {
  requested: { label: "Запрошена", tone: "primary" },
  processing: { label: "Отправляется", tone: "warning" },
  paid: { label: "Выплачена", tone: "success" },
  rejected: { label: "Отклонена", tone: "danger" },
  failed: { label: "Не прошла", tone: "danger" },
};

function Payouts() {
  const { can } = useStaff();
  const toast = useToast();
  const [status, setStatus] = useState("open");
  const { data, error, load } = useData(() => financeApi.payouts(status), [status]);
  const [open, setOpen] = useState<StaffPayoutRow | null>(null);
  const [details, setDetails] = useState<Record<string, string> | null>(null);
  const [dialog, setDialog] = useState<"reject" | "paid" | null>(null);
  const [busy, setBusy] = useState(false);

  const act = async (action: "approve" | "paid" | "reject", note = "") => {
    if (!open) return;
    setBusy(true);
    try {
      const r = await financeApi.payoutAction(open.id, action, note);
      toast(action === "reject" ? "Выплата отклонена, деньги вернулись специалисту" : action === "paid" ? "Отмечено: выплачено" : "Выплата отправлена");
      setOpen(r);
      setDialog(null);
      load();
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(false);
    }
  };

  const showDetails = async () => {
    if (!open) return;
    try {
      setDetails((await financeApi.payoutDetails(open.id)).details);
    } catch (e) {
      toast((e as Error).message, { error: true });
    }
  };

  return (
    <>
      <Toolbar>
        <Segmented
          ariaLabel="Статус выплат"
          value={status}
          onChange={setStatus}
          options={[
            { value: "open", label: "Ждут" },
            { value: "paid", label: "Выплачены" },
            { value: "all", label: "Все" },
          ]}
        />
      </Toolbar>
      {error && <LoadError text={error} onRetry={load} />}
      <Card as="section" padded={false}>
        {!data ? (
          <div className={s.listPad}>
            <Skeleton height={56} radius={16} />
          </div>
        ) : data.items.length ? (
          <div className={s.rows} role="list">
            {data.items.map((p) => {
              const st = PAYOUT_STATUS[p.status];
              return (
                <button
                  key={p.id}
                  type="button"
                  role="listitem"
                  className={s.rowBtn}
                  onClick={() => {
                    setDetails(null);
                    setOpen(p);
                  }}
                >
                  <span className={s.rowMain}>
                    <span className={s.rowTitle}>{p.specialist_name || p.specialist}</span>
                    <span className={s.rowSub}>
                      {dateTime(p.created_at)}, {p.destination}
                    </span>
                  </span>
                  <span className={s.rowMeta}>
                    <Badge tone={st.tone}>{st.label}</Badge>
                    <span className={s.amount}>{rubK(p.amount_kopecks)}</span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <EmptyState art={<EmptyArt scene="sparkles" />} title="Заявок нет" text="Когда специалист запросит выплату, она появится здесь." />
        )}
      </Card>

      <Modal open={!!open && !dialog} onClose={() => setOpen(null)} title="Выплата" width={560}>
        {open && (
          <div className={s.detail}>
            <KV
              items={[
                ["Специалист", `${open.specialist_name} (${open.specialist})`],
                ["Сумма", rubK(open.amount_kopecks)],
                ["Куда", open.destination],
                ["Статус", PAYOUT_STATUS[open.status].label],
                ["Способ", open.rail === "manual" ? "Вручную" : "ЮKassa Выплаты"],
                ["Налоговый статус", open.tax_status === "ip" ? "ИП" : "Самозанятый"],
                ["Создана", dateTime(open.created_at)],
                ...(open.note ? ([["Комментарий", open.note]] as [string, string][]) : []),
              ]}
            />
            {details && (
              <div className={s.notice}>
                <div>
                  {Object.entries(details)
                    .filter(([k]) => k !== "kind")
                    .map(([k, v]) => (
                      <div key={k}>
                        <span className={s.muted}>{k}: </span>
                        <code className={s.code}>{v}</code>
                      </div>
                    ))}
                </div>
              </div>
            )}
            {can("finance.manage") && ["requested", "processing"].includes(open.status) && (
              <div className={s.modalActions}>
                {open.rail === "manual" && !details && (
                  <Button variant="secondary" icon={<Eye size={18} />} onClick={showDetails}>
                    Показать реквизиты
                  </Button>
                )}
                {!(open.rail !== "manual" && open.status === "processing") && (
                  <Button variant="danger" onClick={() => setDialog("reject")}>
                    Отклонить
                  </Button>
                )}
                {open.rail === "manual" ? (
                  <Button variant="primary" icon={<CheckCircle2 size={18} />} onClick={() => setDialog("paid")}>
                    Отметить выплаченной
                  </Button>
                ) : (
                  open.status === "requested" && (
                    <Button variant="primary" loading={busy} icon={<Banknote size={18} />} onClick={() => act("approve")}>
                      Отправить через ЮKassa
                    </Button>
                  )
                )}
              </div>
            )}
          </div>
        )}
      </Modal>
      <ReasonModal
        open={dialog === "reject"}
        title="Отклонить выплату?"
        text="Сумма вернётся в «доступно к выплате». Специалист увидит ваш комментарий."
        reasonLabel="Комментарий для специалиста"
        confirm="Отклонить"
        variant="danger"
        busy={busy}
        onClose={() => setDialog(null)}
        onConfirm={(r) => act("reject", r)}
      />
      <ReasonModal
        open={dialog === "paid"}
        title="Деньги переведены?"
        text="Отмечайте только после перевода. Специалист увидит выплату как выполненную."
        reasonLabel="Номер платёжки или комментарий"
        requireReason={false}
        confirm="Да, выплачено"
        busy={busy}
        onClose={() => setDialog(null)}
        onConfirm={(r) => act("paid", r)}
      />
    </>
  );
}

// ── Созвоны (заморозки) ────────────────────────────────────────────

const HOLD_STATUS: Record<string, { label: string; tone: "neutral" | "success" | "warning" | "danger" | "primary" }> = {
  active: { label: "Заморожено", tone: "primary" },
  captured: { label: "Списано", tone: "success" },
  partial: { label: "Частично", tone: "warning" },
  released: { label: "Возвращено", tone: "neutral" },
  refunded: { label: "Возврат после созвона", tone: "neutral" },
};

const REASON: Record<string, string> = {
  completed: "созвон состоялся",
  auto_completed: "завершён автоматически",
  client_cancel: "клиент отменил заранее",
  late_cancel: "поздняя отмена клиентом",
  specialist_cancel: "специалист отменил",
  specialist_no_show: "специалист не пришёл",
  client_no_show: "клиент не пришёл",
  no_show_both: "никто не пришёл",
  staff_cancel: "отмена командой",
  staff_refund: "возврат командой",
  staff_capture: "списано командой",
  staff_penalty: "решение команды",
  system: "система",
  cancelled: "отменён",
};

function Calls() {
  const { can } = useStaff();
  const toast = useToast();
  const [status, setStatus] = useState("active");
  const { data, error, load } = useData(() => financeApi.holds(status), [status]);
  const [open, setOpen] = useState<StaffHoldRow | null>(null);
  const [action, setAction] = useState<"capture" | "release" | "penalty" | "refund" | null>(null);
  const [percent, setPercent] = useState("50");
  const [busy, setBusy] = useState(false);

  const act = async (reason: string) => {
    if (!open || !action) return;
    setBusy(true);
    try {
      const r = await financeApi.settleHold(open.id, { action, reason, percent: Number(percent) });
      setOpen(r);
      setAction(null);
      toast("Готово");
      load();
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(false);
    }
  };

  const sweep = async () => {
    try {
      const r = await financeApi.sweep();
      toast(`Разобрано: созвонов ${r.calls_settled}, неоплаченных ${r.unpaid_expired}, заработков ${r.earnings_matured}`);
      load();
    } catch (e) {
      toast((e as Error).message, { error: true });
    }
  };

  return (
    <>
      <Toolbar>
        <Segmented
          ariaLabel="Статус"
          value={status}
          onChange={setStatus}
          options={[
            { value: "active", label: "Заморожено" },
            { value: "captured", label: "Списано" },
            { value: "partial", label: "Частично" },
            { value: "released", label: "Возвращено" },
            { value: "all", label: "Все" },
          ]}
        />
        {can("finance.manage") && (
          <Button variant="secondary" icon={<RefreshCw size={16} />} onClick={sweep}>
            Разобрать сейчас
          </Button>
        )}
      </Toolbar>
      {error && <LoadError text={error} onRetry={load} />}
      <Card as="section" padded={false}>
        {!data ? (
          <div className={s.listPad}>
            <Skeleton height={56} radius={16} />
          </div>
        ) : data.items.length ? (
          <div className={s.rows} role="list">
            {data.items.map((h) => (
              <button key={h.id} type="button" role="listitem" className={s.rowBtn} onClick={() => setOpen(h)}>
                <span className={s.rowMain}>
                  <span className={s.rowTitle}>
                    {h.client_alias} и {h.specialist}
                  </span>
                  <span className={s.rowSub}>
                    {h.scheduled_at ? dateTime(h.scheduled_at) : "—"}, {h.duration_minutes} мин
                    {h.reason ? `, ${REASON[h.reason] ?? h.reason}` : ""}
                  </span>
                </span>
                <span className={s.rowMeta}>
                  <Badge tone={HOLD_STATUS[h.status].tone}>{HOLD_STATUS[h.status].label}</Badge>
                  <span className={s.amount}>{rubK(h.amount_kopecks)}</span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState art={<EmptyArt scene="calendar" />} title="Пусто" text="Созвонов с таким статусом оплаты нет." />
        )}
      </Card>

      <Modal open={!!open && !action} onClose={() => setOpen(null)} title="Оплата созвона" width={560}>
        {open && (
          <div className={s.detail}>
            <KV
              items={[
                ["Клиент", open.client_alias],
                ["Специалист", open.specialist],
                ["Созвон", `${open.scheduled_at ? dateTime(open.scheduled_at) : "—"}, ${open.duration_minutes} мин`],
                ["Статус созвона", open.session_status ?? "удалён"],
                ["Сумма", rubK(open.amount_kopecks)],
                ["Оплата", `${HOLD_STATUS[open.status].label}${open.reason ? `, ${REASON[open.reason] ?? open.reason}` : ""}`],
                ...(open.status !== "active"
                  ? ([
                      ["Специалисту", rubK(open.specialist_kopecks)],
                      ["Комиссия", rubK(open.fee_kopecks)],
                      ["Вернули клиенту", rubK(open.returned_kopecks)],
                    ] as [string, string][])
                  : []),
                ["ID созвона", <code key="id" className={s.code}>{open.session_id}</code>],
              ]}
            />
            {can("finance.manage") && (
              <div className={s.modalActions}>
                {open.status === "active" ? (
                  <>
                    <Button variant="secondary" onClick={() => setAction("penalty")}>
                      Частично
                    </Button>
                    <Button variant="secondary" icon={<Undo2 size={18} />} onClick={() => setAction("release")}>
                      Вернуть клиенту
                    </Button>
                    <Button variant="primary" onClick={() => setAction("capture")}>
                      Списать специалисту
                    </Button>
                  </>
                ) : ["captured", "partial"].includes(open.status) ? (
                  <Button variant="danger" icon={<Undo2 size={18} />} onClick={() => setAction("refund")}>
                    Вернуть деньги на баланс
                  </Button>
                ) : null}
              </div>
            )}
          </div>
        )}
      </Modal>
      <ReasonModal
        open={!!action}
        title={
          action === "capture"
            ? "Списать оплату специалисту?"
            : action === "release"
              ? "Вернуть всю сумму клиенту?"
              : action === "penalty"
                ? "Удержать часть суммы?"
                : "Вернуть деньги за состоявшийся созвон?"
        }
        text={
          action === "refund"
            ? "Сумма вернётся на баланс клиента, заработок специалиста и комиссия уменьшатся. Если заработок уже выплачен, используйте корректировку."
            : "Решение перекрывает автоматические правила и записывается в журнал."
        }
        confirm="Подтвердить"
        variant={action === "refund" ? "danger" : "primary"}
        busy={busy}
        onClose={() => setAction(null)}
        onConfirm={act}
      >
        {action === "penalty" && (
          <Input label="Удержать, % (уйдёт специалисту за вычетом комиссии)" inputMode="numeric" value={percent} onChange={(e) => setPercent(e.target.value.replace(/\D/g, ""))} />
        )}
      </ReasonModal>
    </>
  );
}

// ── Балансы ────────────────────────────────────────────────────────

function Balances() {
  const { can } = useStaff();
  const toast = useToast();
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const { data, error, load } = useData(() => financeApi.balances(dq), [dq]);
  const [adjust, setAdjust] = useState<StaffBalanceRow | null>(null);
  const [amount, setAmount] = useState("");
  const [sign, setSign] = useState<"credit" | "debit">("credit");
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState("");

  const open = (row: StaffBalanceRow) => {
    setAdjust(row);
    setAmount("");
    setSign("credit");
    setKey(crypto.randomUUID());
  };

  const submit = async (reason: string) => {
    if (!adjust) return;
    const v = Number(amount.replace(",", "."));
    if (!v) {
      toast("Укажите сумму", { error: true });
      return;
    }
    setBusy(true);
    try {
      const r = await financeApi.adjust({ alias: adjust.alias, amount_rub: sign === "credit" ? v : -v, reason, key });
      toast(`Готово. Баланс: ${rubK(r.balance_kopecks)}`);
      setAdjust(null);
      load();
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="Псевдоним клиента" label="Поиск клиента" />
      </Toolbar>
      {error && <LoadError text={error} onRetry={load} />}
      <Card as="section" padded={false}>
        {!data ? (
          <div className={s.listPad}>
            <Skeleton height={56} radius={16} />
          </div>
        ) : data.items.length ? (
          <div className={s.rows} role="list">
            {data.items.map((b) => (
              <div key={b.user_id} role="listitem" className={s.rowBtn} style={{ cursor: "default" }}>
                <span className={s.rowMain}>
                  <span className={s.rowTitle}>{b.alias}</span>
                  <span className={s.rowSub}>{b.held_kopecks ? `заморожено ${rubK(b.held_kopecks)}` : "без заморозок"}</span>
                </span>
                <span className={s.rowMeta}>
                  <span className={s.amount}>{rubK(b.balance_kopecks)}</span>
                  {can("finance.manage") && (
                    <Button size="sm" variant="secondary" icon={<PlusCircle size={16} />} onClick={() => open(b)}>
                      Корректировка
                    </Button>
                  )}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState art={<EmptyArt scene="search" />} title="Никого не нашли" text="Здесь клиенты с деньгами на балансе. Найдите нужного по псевдониму." />
        )}
      </Card>
      <ReasonModal
        open={!!adjust}
        title={`Корректировка: ${adjust?.alias ?? ""}`}
        text="Например, возврат за сбой связи на баланс. Каждая корректировка — отдельная проводка в журнале."
        confirm={sign === "credit" ? "Зачислить" : "Списать"}
        busy={busy}
        onClose={() => setAdjust(null)}
        onConfirm={submit}
      >
        <div className={s.stack} style={{ marginBottom: 12 }}>
          <Segmented
            ariaLabel="Направление"
            value={sign}
            onChange={setSign}
            options={[
              { value: "credit", label: "Зачислить" },
              { value: "debit", label: "Списать" },
            ]}
          />
          <Input label="Сумма, ₽" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d,.]/g, ""))} />
        </div>
      </ReasonModal>
    </>
  );
}

// ── Пополнения ─────────────────────────────────────────────────────

const TOPUP_STATUS: Record<string, { label: string; tone: "neutral" | "success" | "warning" | "danger" | "primary" }> = {
  pending: { label: "Ожидает", tone: "warning" },
  succeeded: { label: "Зачислено", tone: "success" },
  canceled: { label: "Отменено", tone: "neutral" },
  refunded: { label: "Возвращено на карту", tone: "danger" },
};

function TopUps() {
  const { can } = useStaff();
  const toast = useToast();
  const [status, setStatus] = useState("all");
  const { data, error, load } = useData(() => financeApi.topups(status), [status]);
  const [refund, setRefund] = useState<StaffTopUpRow | null>(null);
  const [busy, setBusy] = useState(false);

  const doRefund = async () => {
    if (!refund) return;
    setBusy(true);
    try {
      await financeApi.topupAction(refund.id, "refund");
      toast("Возврат оформлен");
      setRefund(null);
      load();
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(false);
    }
  };
  const sync = async (t: StaffTopUpRow) => {
    try {
      const r = await financeApi.topupAction(t.id, "sync");
      toast(`Статус: ${TOPUP_STATUS[r.status]?.label ?? r.status}`);
      load();
    } catch (e) {
      toast((e as Error).message, { error: true });
    }
  };

  return (
    <>
      <Toolbar>
        <Segmented
          ariaLabel="Статус пополнений"
          value={status}
          onChange={setStatus}
          options={[
            { value: "all", label: "Все" },
            { value: "succeeded", label: "Зачислены" },
            { value: "pending", label: "Ожидают" },
            { value: "refunded", label: "Возвраты" },
          ]}
        />
      </Toolbar>
      {error && <LoadError text={error} onRetry={load} />}
      <Card as="section" padded={false}>
        {!data ? (
          <div className={s.listPad}>
            <Skeleton height={56} radius={16} />
          </div>
        ) : data.items.length ? (
          <div className={s.rows} role="list">
            {data.items.map((t) => (
              <div key={t.id} role="listitem" className={s.rowBtn} style={{ cursor: "default" }}>
                <span className={s.rowMain}>
                  <span className={s.rowTitle}>
                    {t.alias} {t.provider === "mock" && <Badge tone="sun">тест</Badge>}
                  </span>
                  <span className={s.rowSub}>
                    {dateTime(t.created_at)}
                    {t.provider_payment_id ? `, ${t.provider_payment_id}` : ""}
                    {t.with_receipt ? ", с чеком" : ""}
                  </span>
                </span>
                <span className={s.rowMeta}>
                  <Badge tone={TOPUP_STATUS[t.status].tone}>{TOPUP_STATUS[t.status].label}</Badge>
                  <span className={s.amount}>{rubK(t.amount_kopecks)}</span>
                  {can("finance.manage") && t.status === "pending" && t.provider !== "mock" && (
                    <Button size="sm" variant="ghost" iconOnly aria-label="Проверить статус в ЮKassa" icon={<RefreshCw size={16} />} onClick={() => sync(t)} />
                  )}
                  {can("finance.manage") && t.status === "succeeded" && (
                    <Button size="sm" variant="secondary" onClick={() => setRefund(t)}>
                      Вернуть на карту
                    </Button>
                  )}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState art={<EmptyArt scene="sparkles" />} title="Пополнений нет" />
        )}
      </Card>
      <Modal open={!!refund} onClose={() => !busy && setRefund(null)} title="Вернуть пополнение на карту?" width={460}>
        <p className={s.modalText}>
          {refund && rubK(refund.amount_kopecks)} спишутся с баланса {refund?.alias} и вернутся на карту через платёжный сервис. Если
          часть денег уже потрачена, возврат не пройдёт.
        </p>
        <div className={s.modalActions}>
          <Button variant="ghost" onClick={() => setRefund(null)} disabled={busy}>
            Не возвращать
          </Button>
          <Button variant="danger" loading={busy} onClick={doRefund}>
            Вернуть
          </Button>
        </div>
      </Modal>
    </>
  );
}

// ── Подарочные коды ────────────────────────────────────────────────

function Gifts() {
  const { can } = useStaff();
  const toast = useToast();
  const { data, error, load } = useData(() => financeApi.gifts(), []);
  const [form, setForm] = useState(false);
  const [amount, setAmount] = useState("3000");
  const [count, setCount] = useState("10");
  const [label, setLabel] = useState("");
  const [expires, setExpires] = useState("");
  const [busy, setBusy] = useState(false);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [revoke, setRevoke] = useState<GiftBatchRow | null>(null);

  const create = async () => {
    setBusy(true);
    try {
      const r = await financeApi.createGifts({ amount_rub: Number(amount), count: Number(count), label, expires_at: expires || undefined });
      setCodes(r.codes);
      setForm(false);
      load();
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    if (!codes) return;
    const blob = new Blob([`код;номинал\n${codes.map((c) => `${c};${amount}`).join("\n")}\n`], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `aprosop-codes-${codes.length}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <>
      {can("finance.manage") && (
        <Toolbar>
          <Button variant="primary" icon={<Gift size={18} />} onClick={() => setForm(true)}>
            Выпустить коды
          </Button>
        </Toolbar>
      )}
      {error && <LoadError text={error} onRetry={load} />}
      <Card as="section" padded={false}>
        {!data ? (
          <div className={s.listPad}>
            <Skeleton height={56} radius={16} />
          </div>
        ) : data.items.length ? (
          <div className={s.rows} role="list">
            {data.items.map((b) => (
              <div key={b.id} role="listitem" className={s.rowBtn} style={{ cursor: "default" }}>
                <span className={s.rowMain}>
                  <span className={s.rowTitle}>
                    {b.label || "Без названия"} {b.revoked && <Badge tone="danger">отозвана</Badge>}
                  </span>
                  <span className={s.rowSub}>
                    {dateTime(b.created_at)}, погашено {b.redeemed} из {b.count}
                    {b.expires_at ? `, до ${dateTime(b.expires_at)}` : ""}
                  </span>
                </span>
                <span className={s.rowMeta}>
                  <span className={s.amount}>{rubK(b.amount_kopecks)}</span>
                  {can("finance.manage") && !b.revoked && b.redeemed < b.count && (
                    <Button size="sm" variant="ghost" onClick={() => setRevoke(b)}>
                      Отозвать
                    </Button>
                  )}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            art={<EmptyArt scene="heart" />}
            title="Кодов ещё нет"
            text="Подарочные коды — предоплата, которую может купить кто угодно: клиент активирует код у себя в балансе."
          />
        )}
      </Card>

      <Modal open={form} onClose={() => !busy && setForm(false)} title="Новая партия кодов" width={480}>
        <div className={s.stack}>
          <Input label="Номинал, ₽" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} />
          <Input label="Сколько кодов (до 1000)" inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value.replace(/\D/g, ""))} />
          <Input label="Название партии" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Например, партнёр или акция" />
          <Input label="Действует до (необязательно)" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
          <p className={s.modalText}>Коды покажем один раз — сразу скачайте их. В базе хранится только их отпечаток.</p>
          <div className={s.modalActions}>
            <Button variant="ghost" onClick={() => setForm(false)} disabled={busy}>
              Отмена
            </Button>
            <Button variant="primary" loading={busy} onClick={create}>
              Выпустить
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!codes} onClose={() => setCodes(null)} title={`Коды: ${codes?.length ?? 0}`} width={520}>
        <div className={s.stack}>
          <p className={s.modalText}>Сохраните их сейчас: после закрытия окна увидеть коды снова нельзя.</p>
          <div className={s.miniList} style={{ maxHeight: 260, overflow: "auto", fontFamily: "ui-monospace, monospace" }}>
            {codes?.map((c) => <div key={c}>{c}</div>)}
          </div>
          <div className={s.modalActions}>
            <Button
              variant="secondary"
              icon={<Copy size={16} />}
              onClick={() => {
                navigator.clipboard?.writeText(codes?.join("\n") ?? "");
                toast("Скопировано");
              }}
            >
              Скопировать
            </Button>
            <Button variant="primary" icon={<Download size={16} />} onClick={download}>
              Скачать CSV
            </Button>
          </div>
        </div>
      </Modal>

      <ReasonModal
        open={!!revoke}
        title="Отозвать непогашенные коды?"
        text="Уже активированные коды останутся на балансах. Остальные перестанут работать."
        confirm="Отозвать"
        variant="danger"
        requireReason={false}
        onClose={() => setRevoke(null)}
        onConfirm={async () => {
          if (!revoke) return;
          try {
            const r = await financeApi.revokeGifts(revoke.id);
            toast(`Отозвано кодов: ${r.revoked}`);
            setRevoke(null);
            load();
          } catch (e) {
            toast((e as Error).message, { error: true });
          }
        }}
      />
    </>
  );
}

// ── Сверка ─────────────────────────────────────────────────────────

function ReconcileTab() {
  const toast = useToast();
  const { data, error, load } = useData<Reconcile>(() => financeApi.reconcile(), []);
  const exportCsv = async () => {
    try {
      const blob = await financeApi.exportCsv(31);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "aprosop-ledger-31d.csv";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      toast((e as Error).message, { error: true });
    }
  };
  if (error) return <LoadError text={error} onRetry={load} />;
  if (!data) return <Skeleton height={260} radius={22} />;
  const l = data.ledger;
  return (
    <div className={s.stack}>
      <Card as="section">
        <CardHead
          title="Журнал проводок"
          icon={<Scale size={18} />}
          action={
            <Button size="sm" variant="secondary" icon={<Download size={16} />} onClick={exportCsv}>
              CSV за месяц
            </Button>
          }
        />
        <KV
          items={[
            ["Итог", l.ok ? <Badge key="ok" tone="success">Всё сходится</Badge> : <Badge key="bad" tone="danger">Есть расхождения</Badge>],
            ["Сумма всех проводок", rubK(l.total_kopecks)],
            ["Несбалансированные операции", String(l.unbalanced_transactions.length)],
            ["Расхождение кэша балансов", String(l.cache_drift.length)],
            ["Счета клиентов в минусе", String(l.negative_user_accounts.length)],
          ]}
        />
      </Card>
      <Card as="section">
        <CardHead
          title="Сверка с ЮKassa за 7 дней"
          icon={<Wallet size={18} />}
          sub={data.provider.checked ? `Платежей у ЮKassa: ${data.provider.count}` : data.provider.error ?? "ЮKassa не подключена — сверять не с чем."}
        />
        {data.mismatches.length ? (
          <div className={s.rows}>
            {data.mismatches.map((m) => (
              <div key={m.payment_id} className={s.rowBtn} style={{ cursor: "default" }}>
                <span className={s.rowMain}>
                  <span className={s.rowTitle}>{m.problem}</span>
                  <span className={s.rowSub}>
                    {m.payment_id}, у ЮKassa: {m.provider_status}
                    {m.our_status ? `, у нас: ${m.our_status}` : ""}
                  </span>
                </span>
              </div>
            ))}
          </div>
        ) : (
          data.provider.checked && <p className={s.muted}>Расхождений нет.</p>
        )}
      </Card>
      <Card as="section">
        <CardHead title="Последние уведомления ЮKassa" icon={<RefreshCw size={18} />} />
        {data.webhooks.length ? (
          <ol className={s.timeline}>
            {data.webhooks.map((w, i) => (
              <li key={i}>
                <span>
                  {w.event} → {w.result}
                </span>
                <span className={s.muted}>
                  {dateTime(w.received_at)}, {w.object_id}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className={s.muted}>Уведомлений ещё не было.</p>
        )}
      </Card>
    </div>
  );
}
