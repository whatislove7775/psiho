"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BadgeCheck, Check, ChevronDown, Pencil, X } from "lucide-react";
import { Badge, Button, Card, EmptyState, Input, Modal, Segmented, Skeleton, Textarea, useToast } from "@/ui";
import { PageHeader } from "@/components/shell/AppShell";
import { SpecialistPhoto } from "@/components/avatar/SpecialistPhoto";
import { RequirePerm, useStaff } from "@/components/admin/AdminShell";
import { dateOnly, KV, Pager, ReasonModal, SearchBox, Toolbar, useDebounced, ago } from "@/components/admin/kit";
import { LoadError } from "@/components/pro/controls";
import { staffApi, type Page, type SpecialistDecision, type StaffSpecialist } from "@/lib/api/staff";
import type { VerificationStatus } from "@/lib/api/types";
import { plural, rub } from "@/lib/format";
import a from "@/components/admin/admin.module.css";
import s from "@/components/admin/staff.module.css";
import { EmptyArt } from "@/components/illustrations";

const TABS: { value: VerificationStatus; label: string; empty: string }[] = [
  { value: "pending", label: "На проверке", empty: "Новых заявок нет. Когда специалист зарегистрируется, его анкета появится здесь." },
  { value: "approved", label: "В каталоге", empty: "Одобренных специалистов пока нет." },
  { value: "suspended", label: "Приостановлены", empty: "Приостановленных специалистов нет." },
  { value: "rejected", label: "Отклонены", empty: "Отклонённых заявок нет." },
];

const ACTIONS: Record<VerificationStatus, SpecialistDecision[]> = {
  pending: ["approve", "reject"],
  approved: ["suspend"],
  suspended: ["reinstate"],
  rejected: ["approve"],
};

const DECISION: Record<
  SpecialistDecision,
  { button: string; title: string; text: string; done: string; variant: "primary" | "danger"; perm: "specialists.verify" | "specialists.suspend"; reason: boolean }
> = {
  approve: {
    button: "Одобрить",
    title: "Одобрить специалиста?",
    text: "Карточка сразу появится в каталоге, клиенты смогут записываться в свободные часы.",
    done: "Специалист одобрен",
    variant: "primary",
    perm: "specialists.verify",
    reason: false,
  },
  reject: {
    button: "Отклонить",
    title: "Отклонить заявку?",
    text: "Специалист увидит причину в кабинете. Позже заявку можно одобрить на вкладке «Отклонены».",
    done: "Заявка отклонена",
    variant: "danger",
    perm: "specialists.verify",
    reason: true,
  },
  suspend: {
    button: "Приостановить",
    title: "Приостановить специалиста?",
    text: "Карточка пропадёт из каталога, новые записи станут недоступны. Уже оплаченные созвоны не отменятся, проверьте их в разделе «Созвоны».",
    done: "Специалист приостановлен",
    variant: "danger",
    perm: "specialists.suspend",
    reason: true,
  },
  reinstate: {
    button: "Вернуть в каталог",
    title: "Вернуть специалиста в каталог?",
    text: "Карточка снова станет видна клиентам.",
    done: "Специалист снова в каталоге",
    variant: "primary",
    perm: "specialists.verify",
    reason: false,
  },
};

export default function Page_() {
  return (
    <RequirePerm perm="specialists.view">
      <Suspense fallback={null}>
        <SpecialistsPage />
      </Suspense>
    </RequirePerm>
  );
}

function SpecialistsPage() {
  const { can } = useStaff();
  const toast = useToast();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const initial = params.get("status") as VerificationStatus | null;
  const [tab, setTab] = useState<VerificationStatus>(initial && ACTIONS[initial] ? initial : "pending");
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<(Page<StaffSpecialist> & { counts: Record<VerificationStatus, number> }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [detail, setDetail] = useState<StaffSpecialist | null>(null);
  const [confirm, setConfirm] = useState<{ p: StaffSpecialist; d: SpecialistDecision } | null>(null);
  const [edit, setEdit] = useState<StaffSpecialist | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setError(null);
    staffApi
      .specialists({ status: tab, q: dq, page })
      .then((d) => {
        setData(d);
        if (d.results.length === 1) setOpen(d.results[0].id);
      })
      .catch((e) => setError(`${(e as Error).message} Попробуйте ещё раз.`));
  }, [tab, dq, page]);
  useEffect(load, [load]);

  useEffect(() => {
    setDetail(null);
    if (open != null) staffApi.specialist(open).then(setDetail).catch(() => {});
  }, [open]);

  const changeTab = (t: VerificationStatus) => {
    setTab(t);
    setOpen(null);
    setPage(1);
    setData(null);
    router.replace(`${pathname}?status=${t}`, { scroll: false });
  };

  const decide = async (reason: string) => {
    if (!confirm) return;
    setBusy(true);
    try {
      await staffApi.decide(confirm.p.id, confirm.d, reason);
      toast(`${DECISION[confirm.d].done}: ${confirm.p.display_name}`);
      setConfirm(null);
      setOpen(null);
      load();
    } catch (e) {
      toast(`${(e as Error).message} Статус не изменился.`, { error: true });
    } finally {
      setBusy(false);
    }
  };

  const current = TABS.find((t) => t.value === tab)!;

  return (
    <>
      <PageHeader
        title="Специалисты"
      />
      <div className={s.tabsRow}>
        <Segmented<VerificationStatus>
          ariaLabel="Статус специалистов"
          value={tab}
          onChange={changeTab}
          options={TABS.map((t) => ({
            value: t.value,
            label: data?.counts?.[t.value] ? `${t.label} ${data.counts[t.value]}` : t.label,
          }))}
        />
      </div>
      <Toolbar>
        <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Имя специалиста" label="Поиск специалиста" />
      </Toolbar>
      {error && <LoadError text={error} onRetry={load} />}
      <Card as="section">
        {!data ? (
          <div className={a.list}>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} height={68} radius={18} />
            ))}
          </div>
        ) : data.results.length ? (
          <>
            <div className={a.list}>
              {data.results.map((p) => {
                const isOpen = open === p.id;
                const d = isOpen && detail?.id === p.id ? detail : null;
                return (
                  <div key={p.id} className={a.item} data-open={isOpen || undefined}>
                    <button type="button" className={a.summary} aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : p.id)}>
                      <SpecialistPhoto url={p.photo_url} name={p.display_name} size={44} />
                      <span style={{ minWidth: 0 }}>
                        <span className={a.name} style={{ display: "block" }}>
                          {p.display_name}
                        </span>
                        <span className={a.meta} style={{ display: "block" }}>
                          {tab === "pending" ? `Ждёт ${ago(p.created_at).replace(" назад", "")}` : p.specializations.join(", ") || "Специализации не указаны"}
                        </span>
                      </span>
                      <span className={a.rate}>
                        {p.hourly_rate_rub ? `${rub(p.hourly_rate_rub)} в час` : `от ${rub(p.session_rate_rub)}`}
                        <small>
                          опыт {p.experience_years} {plural(p.experience_years, "год", "года", "лет")}
                        </small>
                      </span>
                      <ChevronDown size={20} className={a.chev} aria-hidden />
                    </button>
                    {isOpen && (
                      <div className={a.details}>
                        {p.rejection_reason && (tab === "rejected" || tab === "suspended") && (
                          <div className={s.alert}>
                            <X size={18} />
                            <span>Причина: {p.rejection_reason}</span>
                          </div>
                        )}
                        <dl className={a.dl}>
                          <dt>О себе</dt>
                          <dd>{(d ?? p).bio || <span className={a.missing}>Не заполнено</span>}</dd>
                          <dt>Подход</dt>
                          <dd>{p.approach || <span className={a.missing}>Не заполнено</span>}</dd>
                          <dt>Специализации</dt>
                          <dd>
                            {p.specializations.length ? (
                              <span className={a.tags}>
                                {p.specializations.map((t) => (
                                  <span key={t}>{t}</span>
                                ))}
                              </span>
                            ) : (
                              <span className={a.missing}>Не указаны</span>
                            )}
                          </dd>
                          <dt>Цена</dt>
                          <dd>
                            {p.hourly_rate_rub ? `${rub(p.hourly_rate_rub)} в час, ` : ""}самый короткий созвон {rub(p.session_rate_rub)}
                          </dd>
                          <dt>Языки</dt>
                          <dd>{p.languages.join(", ") || "Не указаны"}</dd>
                          <dt>Документы</dt>
                          <dd>
                            <span className={s.docs}>
                              <Doc ok={p.documents.photo} label="Фото" />
                              <Doc ok={p.documents.full_name} label="ФИО" />
                              <Doc ok={p.documents.diploma} label="Диплом" />
                              <Doc ok={p.documents.phone} label="Телефон" />
                            </span>
                          </dd>
                          <dt>Заявка</dt>
                          <dd>
                            {dateOnly(p.created_at)}, аккаунт {p.alias}
                            {p.verified_by ? `. Решение: ${p.verified_by}, ${dateOnly(p.verified_at)}` : ""}
                          </dd>
                          {d?.stats && (
                            <>
                              <dt>Созвоны</dt>
                              <dd>
                                {d.stats.completed} проведено, {d.stats.upcoming} впереди, {d.stats.cancelled} отменено
                                {d.reports_open ? (
                                  <>
                                    {" "}
                                    <Badge tone="warning">{d.reports_open} открытых жалоб</Badge>
                                  </>
                                ) : null}
                              </dd>
                              <dt>Расписание</dt>
                              <dd>{d.schedule_rules ? `${d.schedule_rules} ${plural(d.schedule_rules, "правило", "правила", "правил")}` : <span className={a.missing}>Не заполнено</span>}</dd>
                            </>
                          )}
                        </dl>
                        <div className={a.actions}>
                          {can("specialists.edit") && (
                            <Button variant="ghost" icon={<Pencil size={16} />} onClick={() => setEdit(d ?? p)}>
                              Редактировать
                            </Button>
                          )}
                          {ACTIONS[tab]
                            .filter((dec) => can(DECISION[dec].perm))
                            .map((dec) => (
                              <Button key={dec} variant={DECISION[dec].variant} onClick={() => setConfirm({ p, d: dec })}>
                                {DECISION[dec].button}
                              </Button>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <Pager page={data.page} pages={data.pages} count={data.count} onPage={setPage} noun={["специалист", "специалиста", "специалистов"]} />
          </>
        ) : (
          <EmptyState art={<EmptyArt scene="specialist" />} icon={<BadgeCheck size={22} />} title={tab === "pending" ? "Очередь пуста" : "Здесь пока никого"} text={q ? "По этому запросу никого нет." : current.empty} />
        )}
      </Card>

      <ReasonModal
        open={!!confirm}
        title={confirm ? DECISION[confirm.d].title : ""}
        text={confirm ? DECISION[confirm.d].text : ""}
        confirm={confirm ? DECISION[confirm.d].button : ""}
        variant={confirm ? DECISION[confirm.d].variant : "primary"}
        requireReason={confirm ? DECISION[confirm.d].reason : false}
        reasonLabel={confirm && DECISION[confirm.d].reason ? "Причина для специалиста" : "Комментарий"}
        reasonHint={confirm && DECISION[confirm.d].reason ? "Специалист увидит её в кабинете. Пишите спокойно и по делу." : undefined}
        busy={busy}
        onClose={() => setConfirm(null)}
        onConfirm={decide}
      >
        {confirm && (
          <div className={s.detailHead}>
            <SpecialistPhoto url={confirm.p.photo_url} name={confirm.p.display_name} size={40} />
            <strong>{confirm.p.display_name}</strong>
          </div>
        )}
      </ReasonModal>
      <EditModal
        p={edit}
        onClose={() => setEdit(null)}
        onSaved={(x) => {
          setEdit(null);
          setDetail(x);
          load();
          toast("Профиль сохранён");
        }}
      />
    </>
  );
}

function Doc({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={s.doc} data-ok={ok || undefined}>
      {ok ? <Check size={14} /> : <X size={14} />}
      {label}
    </span>
  );
}

function EditModal({ p, onClose, onSaved }: { p: StaffSpecialist | null; onClose: () => void; onSaved: (x: StaffSpecialist) => void }) {
  const [form, setForm] = useState({ display_name: "", bio: "", approach: "", specializations: "", hourly_rate_rub: "", experience_years: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (p)
      setForm({
        display_name: p.display_name,
        bio: p.bio,
        approach: p.approach,
        specializations: p.specializations.join(", "),
        hourly_rate_rub: String(p.hourly_rate_rub ?? ""),
        experience_years: String(p.experience_years),
      });
    setError(null);
  }, [p]);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const save = async () => {
    if (!p) return;
    setBusy(true);
    setError(null);
    try {
      const x = await staffApi.editSpecialist(p.id, {
        display_name: form.display_name.trim(),
        bio: form.bio,
        approach: form.approach,
        specializations: form.specializations.split(",").map((t) => t.trim()).filter(Boolean),
        ...(form.hourly_rate_rub ? { hourly_rate_rub: Number(form.hourly_rate_rub) } : {}),
        experience_years: Number(form.experience_years) || 0,
      });
      onSaved(x);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={!!p} onClose={() => !busy && onClose()} title="Профиль специалиста" width={600}>
      <div className={s.form}>
        <Input label="Имя в каталоге" value={form.display_name} onChange={set("display_name")} maxLength={80} />
        <div className={s.formRow}>
          <Input label="Цена часа, ₽" hint="Цена созвона считается от неё по длительности" inputMode="numeric" value={form.hourly_rate_rub} onChange={set("hourly_rate_rub")} />
          <Input label="Опыт, лет" inputMode="numeric" value={form.experience_years} onChange={set("experience_years")} />
        </div>
        <Input label="Специализации" hint="Через запятую" value={form.specializations} onChange={set("specializations")} />
        <Textarea label="О себе" rows={4} value={form.bio} onChange={set("bio")} maxLength={1200} />
        <Textarea label="Подход" rows={3} value={form.approach} onChange={set("approach")} maxLength={2000} error={error ?? undefined} />
        <p className={s.muted}>Изменения попадут в журнал действий. Специалист увидит их в своём профиле.</p>
        <div className={s.modalActions}>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Отмена
          </Button>
          <Button variant="primary" loading={busy} onClick={save}>
            Сохранить
          </Button>
        </div>
      </div>
    </Modal>
  );
}

