"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BadgeCheck, ChevronDown } from "lucide-react";
import { Button, Card, EmptyState, Modal, Segmented, Skeleton, useToast } from "@/ui";
import { PageHeader } from "@/components/shell/AppShell";
import { AvatarThumb } from "@/components/avatar/AvatarThumb";
import { LoadError } from "@/components/pro/controls";
import { adminApi } from "@/lib/api/endpoints";
import type { PsychologistPrivate, VerificationStatus } from "@/lib/api/types";
import { day, plural, rub } from "@/lib/format";
import a from "@/components/admin/admin.module.css";

type Decision = "approved" | "rejected" | "suspended";

const TABS: { value: VerificationStatus; label: string; empty: string }[] = [
  { value: "pending", label: "На проверке", empty: "Новых заявок нет. Когда специалист зарегистрируется, его анкета появится здесь." },
  { value: "approved", label: "Одобрены", empty: "Одобренных специалистов пока нет. Проверьте заявки на соседней вкладке." },
  { value: "rejected", label: "Отклонены", empty: "Отклонённых заявок нет." },
  { value: "suspended", label: "Приостановлены", empty: "Приостановленных специалистов нет." },
];

const ACTIONS: Record<VerificationStatus, Decision[]> = {
  pending: ["approved", "rejected"],
  approved: ["suspended"],
  rejected: ["approved"],
  suspended: ["approved"],
};

const DECISION: Record<Decision, { button: string; title: string; text: string; done: string; variant: "primary" | "danger" | "secondary" }> = {
  approved: {
    button: "Одобрить",
    title: "Одобрить специалиста?",
    text: "Карточка сразу появится в каталоге, клиенты смогут записываться в свободные часы из расписания.",
    done: "Специалист одобрен и виден в каталоге",
    variant: "primary",
  },
  rejected: {
    button: "Отклонить",
    title: "Отклонить заявку?",
    text: "Специалист не появится в каталоге и увидит в кабинете, что проверка не пройдена. Позже заявку можно одобрить на вкладке «Отклонены».",
    done: "Заявка отклонена",
    variant: "danger",
  },
  suspended: {
    button: "Приостановить",
    title: "Приостановить специалиста?",
    text: "Карточка пропадёт из каталога, новые записи станут недоступны. Уже оплаченные сессии не отменятся автоматически, проверьте их в разделе «Сессии».",
    done: "Специалист приостановлен",
    variant: "danger",
  },
};

export default function Page() {
  return (
    <Suspense fallback={null}>
      <PsychologistsPage />
    </Suspense>
  );
}

function PsychologistsPage() {
  const toast = useToast();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const initial = params.get("status") as VerificationStatus | null;
  const [tab, setTab] = useState<VerificationStatus>(initial && ACTIONS[initial] ? initial : "pending");
  const [items, setItems] = useState<PsychologistPrivate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<{ p: PsychologistPrivate; d: Decision } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback((status: VerificationStatus) => {
    setError(null);
    setItems(null);
    adminApi
      .psychologists(status)
      .then((xs) => {
        setItems(xs);
        if (xs.length === 1) setOpen(xs[0].id);
      })
      .catch((e) => setError(`${(e as Error).message} Попробуйте ещё раз.`));
  }, []);
  useEffect(() => load(tab), [load, tab]);

  const changeTab = (t: VerificationStatus) => {
    setTab(t);
    setOpen(null);
    router.replace(`${pathname}?status=${t}`, { scroll: false });
  };

  const decide = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      await adminApi.verify(confirm.p.id, confirm.d);
      setItems((xs) => (xs ?? []).filter((x) => x.id !== confirm.p.id));
      toast(`${DECISION[confirm.d].done}: ${confirm.p.display_name}`);
      setConfirm(null);
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
        title="Проверка специалистов"
        sub="Прочитайте анкету целиком перед решением: клиенты доверяют каталогу и не видят, кто за аватаром."
      />
      <div style={{ marginBottom: 16 }}>
        <Segmented<VerificationStatus> ariaLabel="Статус специалистов" value={tab} onChange={changeTab} options={TABS} />
      </div>
      {error && <LoadError text={error} onRetry={() => load(tab)} />}
      <Card as="section">
        {!items && !error ? (
          <div className={a.list}>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} height={68} radius={18} />
            ))}
          </div>
        ) : items && items.length ? (
          <div className={a.list}>
            {items.map((p) => {
              const isOpen = open === p.id;
              return (
                <div key={p.id} className={a.item} data-open={isOpen || undefined}>
                  <button
                    type="button"
                    className={a.summary}
                    aria-expanded={isOpen}
                    aria-controls={`psy-${p.id}`}
                    onClick={() => setOpen(isOpen ? null : p.id)}
                  >
                    <AvatarThumb config={p.avatar_config} seed={p.id} size={44} />
                    <span style={{ minWidth: 0 }}>
                      <span className={a.name} style={{ display: "block" }}>
                        {p.display_name}
                      </span>
                      <span className={a.meta} style={{ display: "block" }}>
                        {p.specializations.join(", ") || "Специализации не указаны"}
                      </span>
                    </span>
                    <span className={a.rate}>
                      {rub(p.session_rate_rub)}
                      <small>
                        опыт {p.experience_years} {plural(p.experience_years, "год", "года", "лет")}
                      </small>
                    </span>
                    <ChevronDown size={20} className={a.chev} aria-hidden />
                  </button>
                  {isOpen && (
                    <div className={a.details} id={`psy-${p.id}`}>
                      <dl className={a.dl}>
                        <dt>О себе</dt>
                        <dd>{p.bio || <span className={a.missing}>Не заполнено</span>}</dd>
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
                        <dt>Языки</dt>
                        <dd>{p.languages.join(", ") || "Не указаны"}</dd>
                        <dt>Стоимость</dt>
                        <dd>
                          {rub(p.session_rate_rub)} за 50 минут, {rub(Math.round(p.session_rate_rub * 1.5))} за 80 минут
                        </dd>
                        <dt>Опыт</dt>
                        <dd>
                          {p.experience_years} {plural(p.experience_years, "год", "года", "лет")}
                        </dd>
                        <dt>Заявка подана</dt>
                        <dd>{p.created_at ? `${day(p.created_at)} ${new Date(p.created_at).getFullYear()}` : "Неизвестно"}</dd>
                      </dl>
                      <div className={a.actions}>
                        {ACTIONS[tab].map((d) => (
                          <Button key={d} variant={DECISION[d].variant} onClick={() => setConfirm({ p, d })}>
                            {DECISION[d].button}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState icon={<BadgeCheck size={22} />} title={tab === "pending" ? "Очередь пуста" : "Здесь пока никого"} text={current.empty} />
        )}
      </Card>

      <Modal open={!!confirm} onClose={() => !busy && setConfirm(null)} title={confirm ? DECISION[confirm.d].title : ""}>
        {confirm && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
              <AvatarThumb config={confirm.p.avatar_config} seed={confirm.p.id} size={40} />
              <strong>{confirm.p.display_name}</strong>
            </div>
            <p style={{ color: "var(--c-muted)", marginBottom: 20 }}>{DECISION[confirm.d].text}</p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <Button variant="ghost" onClick={() => setConfirm(null)} disabled={busy}>
                Не менять
              </Button>
              <Button variant={DECISION[confirm.d].variant} loading={busy} onClick={decide}>
                {DECISION[confirm.d].button}
              </Button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
