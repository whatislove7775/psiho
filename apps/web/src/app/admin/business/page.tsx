"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Inbox, PlusCircle } from "lucide-react";
import { Badge, Button, Card, EmptyState, Input, Modal, Segmented, Select, Skeleton, useToast } from "@/ui";
import { PageHeader } from "@/components/shell/AppShell";
import { RequirePerm, useStaff } from "@/components/admin/AdminShell";
import { SearchBox, Toolbar, dateTime, useDebounced } from "@/components/admin/kit";
import { useLoad } from "@/components/client/useLoad";
import { ErrorBlock } from "@/components/client/ClientBits";
import { EmptyArt } from "@/components/illustrations";
import { ApiError } from "@/lib/api/client";
import { businessApi, type Lead } from "@/lib/api/business";
import { rubK } from "@/lib/api/billing";
import s from "@/components/business/business.module.css";

type Tab = "companies" | "leads";

export default function BusinessAdminPage() {
  return (
    <RequirePerm perm="business.view">
      <BusinessAdmin />
    </RequirePerm>
  );
}

function BusinessAdmin() {
  const [tab, setTab] = useState<Tab>("companies");
  const { can } = useStaff();
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const list = useLoad(() => businessApi.staff.companies(dq), [dq]);
  const [createOpen, setCreateOpen] = useState<Lead | true | null>(null);
  const router = useRouter();

  return (
    <>
      <PageHeader
        title="Компании"
        sub="B2B-программы: бюджеты, программы, HR-доступы и заявки с лендинга. Данных сотрудников здесь нет — только агрегаты."
        action={
          can("business.manage") ? (
            <Button variant="primary" icon={<PlusCircle size={18} />} onClick={() => setCreateOpen(true)}>
              Добавить компанию
            </Button>
          ) : undefined
        }
      />
      <div style={{ marginBottom: 16 }}>
        <Segmented<Tab>
          ariaLabel="Раздел"
          value={tab}
          onChange={setTab}
          options={[
            { value: "companies", label: "Компании" },
            { value: "leads", label: `Заявки${list.data?.new_leads ? ` (${list.data.new_leads})` : ""}` },
          ]}
        />
      </div>

      {tab === "companies" ? (
        <Card as="section">
          <Toolbar>
            <SearchBox value={q} onChange={setQ} placeholder="Название или ИНН" label="Поиск компании" />
          </Toolbar>
          {list.error ? (
            <ErrorBlock message={list.error} onRetry={list.reload} />
          ) : !list.data ? (
            <Skeleton height={160} radius={14} />
          ) : list.data.results.length === 0 ? (
            <EmptyState art={<EmptyArt scene="sparkles" />} title="Компаний пока нет" text="Добавьте компанию вручную или из заявки с лендинга." />
          ) : (
            <div className={s.list}>
              {list.data.results.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={s.item}
                  style={{ background: "none", border: 0, borderTop: "1px solid var(--c-line)", textAlign: "left", font: "inherit", color: "inherit", cursor: "pointer", width: "100%" }}
                  onClick={() => router.push(`/admin/business/${c.id}`)}
                >
                  <span className={s.itemIcon}>
                    <Building2 size={18} />
                  </span>
                  <span className={s.itemMain}>
                    <span className={s.itemTitle}>
                      {c.name} {c.status !== "active" && <Badge tone="neutral">{c.status_label}</Badge>}
                      {c.open_invoices > 0 && <Badge tone="sun">счетов к оплате: {c.open_invoices}</Badge>}
                    </span>
                    <span className={s.itemSub}>
                      {c.plan_label}
                      {c.inn ? `, ИНН ${c.inn}` : ""}, HR: {c.admins}
                    </span>
                  </span>
                  <strong style={{ fontVariantNumeric: "tabular-nums" }}>{rubK(c.budget_kopecks)}</strong>
                </button>
              ))}
            </div>
          )}
        </Card>
      ) : (
        <Leads onCreate={(l) => setCreateOpen(l)} />
      )}

      <CreateCompany
        open={createOpen !== null}
        lead={createOpen && createOpen !== true ? createOpen : null}
        onClose={() => setCreateOpen(null)}
        onCreated={(id) => router.push(`/admin/business/${id}`)}
      />
    </>
  );
}

const LEAD_TONE = { new: "primary", in_progress: "sun", done: "neutral" } as const;

function Leads({ onCreate }: { onCreate: (l: Lead) => void }) {
  const toast = useToast();
  const { can } = useStaff();
  const leads = useLoad(() => businessApi.staff.leads(), []);
  const setStatus = async (l: Lead, st: Lead["status"]) => {
    try {
      await businessApi.staff.updateLead(l.id, st);
      leads.reload();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Не получилось.", { error: true });
    }
  };
  if (leads.error) return <ErrorBlock message={leads.error} onRetry={leads.reload} />;
  if (!leads.data) return <Skeleton height={160} radius={14} />;
  if (leads.data.results.length === 0)
    return <EmptyState art={<EmptyArt scene="sparkles" />} icon={<Inbox size={22} />} title="Заявок нет" text="Заявки с формы «Рассчитать для компании» появятся здесь." />;
  return (
    <div className={s.list} style={{ gap: 12 }}>
      {leads.data.results.map((l) => (
        <Card key={l.id} as="article">
          <div className={s.spread}>
            <div className={s.itemMain}>
              <span className={s.itemTitle}>
                {l.company_name} <Badge tone={LEAD_TONE[l.status]}>{l.status_label}</Badge>
              </span>
              <span className={s.itemSub}>
                {[l.contact_name, l.contact, l.employees ? `${l.employees} сотр.` : null, dateTime(l.created_at)].filter(Boolean).join(", ")}
              </span>
            </div>
            {can("business.manage") && (
              <div className={s.row}>
                {l.status === "new" && (
                  <Button size="sm" variant="ghost" onClick={() => setStatus(l, "in_progress")}>
                    Взять в работу
                  </Button>
                )}
                {l.status !== "done" && (
                  <>
                    <Button size="sm" variant="soft" onClick={() => onCreate(l)}>
                      Создать компанию
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setStatus(l, "done")}>
                      Закрыть
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
          {l.message && <p className={s.muted} style={{ marginTop: 10 }}>{l.message}</p>}
        </Card>
      ))}
    </div>
  );
}

function CreateCompany({
  open,
  lead,
  onClose,
  onCreated,
}: {
  open: boolean;
  lead: Lead | null;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [form, setForm] = useState({ name: "", inn: "", contact_name: "", contact_email: "", plan: "pilot", amount: "5000", calls: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [seeded, setSeeded] = useState<string | null>(null);
  const key = lead?.id ?? "new";
  if (open && seeded !== key) {
    setSeeded(key);
    setForm((f) => ({
      ...f,
      name: lead?.company_name ?? "",
      contact_name: lead?.contact_name ?? "",
      contact_email: lead?.contact ?? "",
    }));
  }
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await businessApi.staff.create({
        name: form.name,
        inn: form.inn,
        contact_name: form.contact_name,
        contact_email: form.contact_email,
        plan: form.plan,
        lead_id: lead?.id,
        program: { amount_rub: form.amount || null, calls_limit: form.calls || null, period: "month", services: ["calls"] },
      });
      onClose();
      setSeeded(null);
      onCreated(r.company.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не получилось создать компанию.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Новая компания" width={560}>
      <form className={s.form} onSubmit={submit}>
        <Input label="Название" value={form.name} onChange={set("name")} required />
        <div className={s.form2}>
          <Input label="ИНН" value={form.inn} onChange={set("inn")} inputMode="numeric" hint="Можно заполнить позже" />
          <Select
            label="Тариф"
            value={form.plan}
            onChange={(v) => setForm({ ...form, plan: v })}
            options={[
              { value: "pilot", label: "Пилот" },
              { value: "standard", label: "Стандарт" },
              { value: "enterprise", label: "Корпоративный" },
            ]}
          />
        </div>
        <div className={s.form2}>
          <Input label="Контактное лицо" value={form.contact_name} onChange={set("contact_name")} />
          <Input label="Email или телефон" value={form.contact_email} onChange={set("contact_email")} />
        </div>
        <div className={s.form2}>
          <Input label="Лимит в месяц, ₽" value={form.amount} onChange={set("amount")} inputMode="numeric" hint="На сотрудника" />
          <Input label="Созвонов в месяц" value={form.calls} onChange={set("calls")} inputMode="numeric" hint="Необязательно" />
        </div>
        {error && (
          <div className={s.muted} role="alert" style={{ color: "var(--c-danger)" }}>
            {error}
          </div>
        )}
        <Button type="submit" variant="primary" loading={busy} disabled={!form.name.trim()}>
          Создать
        </Button>
      </form>
    </Modal>
  );
}
