"use client";

import { useState } from "react";
import {
  ArrowLeft,
  BarChart3,
  Building2,
  Copy,
  Download,
  KeyRound,
  PlusCircle,
  Receipt,
  Scale,
  SlidersHorizontal,
  UserCog,
  Wallet,
} from "lucide-react";
import { Badge, Button, Card, CardHead, Input, Modal, Select, Skeleton, useToast } from "@/ui";
import { PageHeader, WithRail } from "@/components/shell/AppShell";
import { RequirePerm, useStaff } from "@/components/admin/AdminShell";
import { KV } from "@/components/admin/kit";
import { useLoad } from "@/components/client/useLoad";
import { ErrorBlock } from "@/components/client/ClientBits";
import { ProgramForm } from "@/components/business/ProgramForm";
import { Hidden, MonthlyTable } from "@/components/business/Aggregates";
import { ApiError } from "@/lib/api/client";
import { businessApi, dateRu, monthRu, saveCodesCsv, type StaffCompanyDetail } from "@/lib/api/business";
import { rubK } from "@/lib/api/billing";
import { plural } from "@/lib/format";
import s from "@/components/business/business.module.css";

export default function CompanyAdminPage({ params }: { params: { id: string } }) {
  return (
    <RequirePerm perm="business.view">
      <CompanyAdmin id={params.id} />
    </RequirePerm>
  );
}

const INVOICE_TONE = { issued: "sun", paid: "success", canceled: "neutral" } as const;

function CompanyAdmin({ id }: { id: string }) {
  const toast = useToast();
  const { can } = useStaff();
  const manage = can("business.manage");
  const data = useLoad(() => businessApi.staff.company(id), [id]);
  const [secret, setSecret] = useState<{ login: string; password: string } | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [modal, setModal] = useState<"edit" | "invite" | "invoice" | "adjust" | "codes" | "program" | null>(null);

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn();
      if (ok) toast(ok);
      data.reload();
      return true;
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Не получилось.", { error: true });
      return false;
    }
  };

  if (data.error) return <ErrorBlock message={data.error} onRetry={data.reload} />;
  const d = data.data;
  if (!d) return <Skeleton height={420} radius={22} />;
  const c = d.company;
  const current = d.programs.find((p) => p.is_active) ?? d.programs[0] ?? null;

  return (
    <>
      <PageHeader
        title={c.name}
        sub={`${c.plan_label}, ${c.status_label.toLowerCase()}. Клиент с ${dateRu(c.created_at, { day: "numeric", month: "long", year: "numeric" }).replace(/ г\.$/, "")}.`}
        action={
          <Button variant="ghost" href="/admin/business" icon={<ArrowLeft size={18} />}>
            Все компании
          </Button>
        }
      />
      <WithRail
        rail={
          <>
            <Card as="section">
              <CardHead title="Бюджет" icon={<Wallet size={18} />} sub="Живой остаток видят только сотрудники aprosop" />
              <div className={s.kpiValue} style={{ marginBottom: 12 }}>
                {rubK(d.budget_kopecks)}
              </div>
              {manage && (
                <div className={s.row}>
                  <Button size="sm" variant="primary" icon={<Receipt size={16} />} onClick={() => setModal("invoice")}>
                    Выставить счёт
                  </Button>
                  <Button size="sm" variant="ghost" icon={<Scale size={16} />} onClick={() => setModal("adjust")}>
                    Корректировка
                  </Button>
                </div>
              )}
            </Card>
            <Card as="section">
              <CardHead
                title="Компания"
                icon={<Building2 size={18} />}
                action={
                  manage ? (
                    <Button size="sm" variant="ghost" onClick={() => setModal("edit")}>
                      Изменить
                    </Button>
                  ) : undefined
                }
              />
              <KV
                items={[
                  ["Юрлицо", c.legal_name || "не указано"],
                  ["ИНН", c.inn || "не указан"],
                  ["Договор", c.contract_number || "не указан"],
                  ["Контакт", [c.contact_name, c.contact_email, c.contact_phone].filter(Boolean).join(", ") || "не указан"],
                ]}
              />
              {c.note && <p className={s.muted} style={{ marginTop: 10 }}>{c.note}</p>}
            </Card>
            <Card as="section">
              <CardHead
                title="HR-доступы"
                icon={<UserCog size={18} />}
                action={
                  manage ? (
                    <Button size="sm" variant="soft" onClick={() => setModal("invite")}>
                      Пригласить
                    </Button>
                  ) : undefined
                }
              />
              {d.admins.length === 0 ? (
                <p className={s.muted}>Пока нет. Пригласите HR — он получит логин и одноразовый пароль.</p>
              ) : (
                <div className={s.list}>
                  {d.admins.map((a) => (
                    <div key={a.id} className={s.item} style={{ flexWrap: "wrap" }}>
                      <span className={s.itemMain}>
                        <span className={s.itemTitle}>
                          {a.login} {!a.is_active && <Badge tone="neutral">отключён</Badge>}
                        </span>
                        <span className={s.itemSub}>{a.full_name || "без имени"}{a.must_change_password ? ", ещё не сменил пароль" : ""}</span>
                      </span>
                      {manage && (
                        <span className={s.row} style={{ flexBasis: "100%", gap: 4 }}>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={async () => {
                              try {
                                const r = await businessApi.staff.updateAdmin(id, a.id, { reset_password: true });
                                if (r.one_time_password) setSecret({ login: a.login, password: r.one_time_password });
                                data.reload();
                              } catch (e) {
                                toast(e instanceof ApiError ? e.message : "Не получилось.", { error: true });
                              }
                            }}
                          >
                            Сбросить пароль
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => run(() => businessApi.staff.updateAdmin(id, a.id, { is_active: !a.is_active }))}>
                            {a.is_active ? "Отключить" : "Включить"}
                          </Button>
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </>
        }
      >
        <div className={s.grid}>
          <div className={s.kpi}>
            <span className={s.kpiLabel}>Потрачено</span>
            <span className={s.kpiValue}>{rubK(d.stats.totals.spent_kopecks)}</span>
            <span className={s.kpiSub}>за закрытые месяцы</span>
          </div>
          <div className={s.kpi}>
            <span className={s.kpiLabel}>Кодов выпущено</span>
            <span className={s.kpiValue}>{d.stats.codes.issued}</span>
            <span className={s.kpiSub}>
              активировано: <Hidden value={d.stats.codes.activated} k={d.stats.k_min} />
            </span>
          </div>
          <div className={s.kpi}>
            <span className={s.kpiLabel}>Участников</span>
            <span className={s.kpiValue}>
              <Hidden value={d.stats.totals.people} k={d.stats.k_min} />
            </span>
            <span className={s.kpiSub}>пользовались программой</span>
          </div>
        </div>

        <Card as="section">
          <CardHead
            title="Программа"
            icon={<SlidersHorizontal size={18} />}
            action={
              manage && !current ? (
                <Button size="sm" variant="soft" onClick={() => setModal("program")}>
                  Создать
                </Button>
              ) : undefined
            }
          />
          {current ? (
            manage ? (
              <ProgramForm
                key={current.id}
                program={current}
                withStart
                onSave={async (body) => {
                  await businessApi.staff.updateProgram(current.id, body);
                  toast("Программа сохранена");
                  data.reload();
                }}
              />
            ) : (
              <p className={s.muted}>{current.name}</p>
            )
          ) : (
            <p className={s.muted}>Программы нет — без неё коды не выпустить.</p>
          )}
        </Card>

        <Card as="section">
          <CardHead
            title="Коды сотрудников"
            icon={<KeyRound size={18} />}
            action={
              manage && current ? (
                <Button size="sm" variant="soft" icon={<PlusCircle size={16} />} onClick={() => setModal("codes")}>
                  Выпустить
                </Button>
              ) : undefined
            }
          />
          {d.batches.length === 0 ? (
            <p className={s.muted}>Партий пока нет.</p>
          ) : (
            <div className={s.list}>
              {d.batches.map((b) => (
                <div key={b.id} className={s.item}>
                  <span className={s.itemMain}>
                    <span className={s.itemTitle}>
                      {b.label || "Без подписи"} {b.revoked && <Badge tone="neutral">отозвана</Badge>}
                    </span>
                    <span className={s.itemSub}>
                      {b.count} {plural(b.count, "код", "кода", "кодов")}, {monthRu(b.created_month).toLowerCase()}
                    </span>
                  </span>
                  {manage && (
                    <Button size="sm" variant="ghost" icon={<Download size={16} />} onClick={() => businessApi.staff.exportBatch(b.id).catch(() => toast("Не получилось скачать.", { error: true }))}>
                      CSV
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card as="section">
          <CardHead title="Счета" icon={<Receipt size={18} />} />
          {d.invoices.length === 0 ? (
            <p className={s.muted}>Счетов нет.</p>
          ) : (
            <div className={s.list}>
              {d.invoices.map((i) => (
                <div key={i.id} className={s.item}>
                  <span className={s.itemMain}>
                    <span className={s.itemTitle}>
                      № {i.number} <Badge tone={INVOICE_TONE[i.status]}>{i.status_label}</Badge>
                      {i.requested_by_company && <Badge tone="neutral">запросила компания</Badge>}
                    </span>
                    <span className={s.itemSub}>от {dateRu(i.created_at, { day: "numeric", month: "long", year: "numeric" })}</span>
                  </span>
                  <strong style={{ fontVariantNumeric: "tabular-nums" }}>{rubK(i.amount_kopecks)}</strong>
                  {manage && i.status === "issued" && (
                    <span className={s.row}>
                      <Button size="sm" variant="primary" onClick={() => run(() => businessApi.staff.invoiceAction(i.id, "paid"), "Оплата отмечена, бюджет пополнен")}>
                        Оплачен
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => run(() => businessApi.staff.invoiceAction(i.id, "cancel"), "Счёт отменён")}>
                        Отменить
                      </Button>
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card as="section">
          <CardHead title="Использование" icon={<BarChart3 size={18} />} sub={`Как видит компания: при меньше чем ${d.stats.k_min} людях — скрыто`} />
          {d.stats.monthly.length === 0 ? <p className={s.muted}>Закрытых месяцев с расходами пока нет.</p> : <MonthlyTable rows={d.stats.monthly} k={d.stats.k_min} />}
        </Card>
      </WithRail>

      <EditCompany open={modal === "edit"} d={d} onClose={() => setModal(null)} onSaved={data.reload} />
      <Invite
        open={modal === "invite"}
        onClose={() => setModal(null)}
        onInvite={async (login, name) => {
          const r = await businessApi.staff.invite(id, login, name);
          setSecret({ login: r.admin.login, password: r.one_time_password });
          setModal(null);
          data.reload();
        }}
      />
      <AmountModal
        open={modal === "invoice"}
        title="Выставить счёт"
        text="После оплаты по безналу нажмите «Оплачен» — бюджет пополнится."
        withReason={false}
        onClose={() => setModal(null)}
        onSubmit={async (rub) => {
          await businessApi.staff.issueInvoice(id, rub);
          toast("Счёт выставлен");
          setModal(null);
          data.reload();
        }}
      />
      <AmountModal
        open={modal === "adjust"}
        title="Корректировка бюджета"
        text="Отрицательная сумма — списать (например, вернуть остаток компании). Попадёт в журнал."
        withReason
        onClose={() => setModal(null)}
        onSubmit={async (rub, reason) => {
          await businessApi.staff.adjust(id, rub, reason, crypto.randomUUID());
          toast("Бюджет скорректирован");
          setModal(null);
          data.reload();
        }}
      />
      <Modal open={modal === "codes"} onClose={() => setModal(null)} title="Выпустить коды" width={460}>
        <GenerateCodes
          onGenerate={async (n, label) => {
            const r = await businessApi.staff.generate(id, n, label);
            setCodes(r.codes);
            setModal(null);
            data.reload();
          }}
        />
      </Modal>
      <Modal open={modal === "program"} onClose={() => setModal(null)} title="Новая программа" width={620}>
        <ProgramForm
          program={null}
          withStart
          submitLabel="Создать"
          onSave={async (body) => {
            await businessApi.staff.createProgram(id, body);
            setModal(null);
            data.reload();
          }}
        />
      </Modal>
      <Modal open={!!secret} onClose={() => setSecret(null)} title="Доступ для HR" width={460}>
        {secret && (
          <div className={s.form}>
            <p className={s.muted}>Передайте логин и одноразовый пароль HR лично или по защищённому каналу. Пароль больше не покажем.</p>
            <div className={s.codes}>
              <div>Логин: {secret.login}</div>
              <div>Пароль: {secret.password}</div>
              <div>Вход: aprosop.ru/login</div>
            </div>
            <Button
              variant="secondary"
              icon={<Copy size={18} />}
              onClick={() => navigator.clipboard?.writeText(`Логин: ${secret.login}\nПароль: ${secret.password}\nВход: https://aprosop.ru/login`).then(() => toast("Скопировано"))}
            >
              Скопировать
            </Button>
          </div>
        )}
      </Modal>
      <Modal open={!!codes} onClose={() => setCodes(null)} title="Коды готовы" width={520}>
        {codes && (
          <div className={s.form}>
            <div className={s.codes}>
              {codes.map((x) => (
                <div key={x}>{x}</div>
              ))}
            </div>
            <Button variant="primary" icon={<Download size={18} />} onClick={() => saveCodesCsv(codes)}>
              Скачать CSV
            </Button>
          </div>
        )}
      </Modal>
    </>
  );
}

function EditCompany({ open, d, onClose, onSaved }: { open: boolean; d: StaffCompanyDetail; onClose: () => void; onSaved: () => void }) {
  const c = d.company;
  const [f, setF] = useState({
    name: c.name,
    legal_name: c.legal_name,
    inn: c.inn,
    contract_number: c.contract_number,
    contact_name: c.contact_name ?? "",
    contact_email: c.contact_email ?? "",
    contact_phone: c.contact_phone ?? "",
    note: c.note ?? "",
    plan: c.plan as string,
    status: c.status as string,
  });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await businessApi.staff.update(c.id, f);
      onClose();
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не получилось сохранить.");
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Компания" width={620}>
      <form className={s.form} onSubmit={submit}>
        <div className={s.form2}>
          <Input label="Название" value={f.name} onChange={set("name")} />
          <Input label="Юрлицо" value={f.legal_name} onChange={set("legal_name")} />
        </div>
        <div className={s.form2}>
          <Input label="ИНН" value={f.inn} onChange={set("inn")} inputMode="numeric" />
          <Input label="Номер договора" value={f.contract_number} onChange={set("contract_number")} />
        </div>
        <div className={s.form2}>
          <Input label="Контактное лицо" value={f.contact_name} onChange={set("contact_name")} />
          <Input label="Email" value={f.contact_email} onChange={set("contact_email")} />
          <Input label="Телефон" value={f.contact_phone} onChange={set("contact_phone")} />
        </div>
        <div className={s.form2}>
          <Select
            label="Тариф"
            value={f.plan}
            onChange={(v) => setF({ ...f, plan: v })}
            options={[
              { value: "pilot", label: "Пилот" },
              { value: "standard", label: "Стандарт" },
              { value: "enterprise", label: "Корпоративный" },
            ]}
          />
          <Select
            label="Статус"
            value={f.status}
            onChange={(v) => setF({ ...f, status: v })}
            options={[
              { value: "active", label: "Работает" },
              { value: "paused", label: "Приостановлена" },
              { value: "closed", label: "Договор закрыт" },
            ]}
          />
        </div>
        <Input label="Заметка" value={f.note} onChange={set("note")} maxLength={500} error={error ?? undefined} />
        <Button type="submit" variant="primary">
          Сохранить
        </Button>
      </form>
    </Modal>
  );
}

function Invite({ open, onClose, onInvite }: { open: boolean; onClose: () => void; onInvite: (login: string, name: string) => Promise<void> }) {
  const [login, setLogin] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onInvite(login, name);
      setLogin("");
      setName("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не получилось.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Пригласить HR" width={460}>
      <form className={s.form} onSubmit={submit}>
        <Input label="Логин" placeholder="hr-romashka" value={login} onChange={(e) => setLogin(e.target.value.toLowerCase())} error={error ?? undefined} />
        <Input label="Имя (для нас)" value={name} onChange={(e) => setName(e.target.value)} />
        <p className={s.muted}>HR увидит только агрегаты своей компании. При первом входе попросим сменить пароль.</p>
        <Button type="submit" variant="primary" loading={busy} disabled={login.length < 3}>
          Создать доступ
        </Button>
      </form>
    </Modal>
  );
}

function AmountModal({
  open,
  title,
  text,
  withReason,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  text: string;
  withReason: boolean;
  onClose: () => void;
  onSubmit: (rub: number, reason: string) => Promise<void>;
}) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit(Number(amount.replace(/\s/g, "")), reason);
      setAmount("");
      setReason("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не получилось.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title={title} width={460}>
      <form className={s.form} onSubmit={submit}>
        <p className={s.muted}>{text}</p>
        <Input label="Сумма, ₽" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d\s-]/g, ""))} inputMode="numeric" error={withReason ? undefined : (error ?? undefined)} />
        {withReason && <Input label="Причина" value={reason} onChange={(e) => setReason(e.target.value)} error={error ?? undefined} />}
        <Button type="submit" variant="primary" loading={busy} disabled={!amount || (withReason && !reason.trim())}>
          Готово
        </Button>
      </form>
    </Modal>
  );
}

function GenerateCodes({ onGenerate }: { onGenerate: (n: number, label: string) => Promise<void> }) {
  const [count, setCount] = useState("20");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onGenerate(Number(count), label);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не получилось.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className={s.form} onSubmit={submit}>
      <Input label="Сколько кодов" value={count} onChange={(e) => setCount(e.target.value.replace(/\D/g, ""))} inputMode="numeric" error={error ?? undefined} />
      <Input label="Подпись" value={label} onChange={(e) => setLabel(e.target.value)} />
      <Button type="submit" variant="primary" loading={busy} disabled={!Number(count)}>
        Выпустить
      </Button>
    </form>
  );
}
