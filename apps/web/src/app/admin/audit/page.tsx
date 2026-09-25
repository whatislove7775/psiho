"use client";

import { useCallback, useEffect, useState } from "react";
import { ScrollText } from "lucide-react";
import { Card, EmptyState, Skeleton } from "@/ui";
import { PageHeader } from "@/components/shell/AppShell";
import { RequirePerm } from "@/components/admin/AdminShell";
import { actionLabel, dateTime, Pager, RoleBadge, SearchBox, SelectBox, Toolbar, useDebounced } from "@/components/admin/kit";
import { LoadError } from "@/components/pro/controls";
import { staffApi, type AuditEntry, type Page, type StaffRole } from "@/lib/api/staff";
import s from "@/components/admin/staff.module.css";
import { EmptyArt } from "@/components/illustrations";

type Cat = "" | "user" | "specialist" | "session" | "report" | "staff" | "auth" | "content" | "support";
const CATS: { value: Cat; label: string }[] = [
  { value: "", label: "Все действия" },
  { value: "user", label: "Пользователи" },
  { value: "specialist", label: "Специалисты" },
  { value: "session", label: "Созвоны" },
  { value: "report", label: "Жалобы" },
  { value: "content", label: "Материалы" },
  { value: "support", label: "Поддержка" },
  { value: "staff", label: "Команда" },
  { value: "auth", label: "Входы" },
];

const DETAIL_LABEL: Record<string, string> = {
  reason: "Причина",
  note: "Комментарий",
  from: "Было",
  to: "Стало",
  role: "Роль",
  action: "Мера",
  fields: "Поля",
  refund_mode: "Возврат",
  report: "Жалоба",
  second_factor: "Код 2FA",
};

function detailValue(v: unknown): string {
  if (v === true) return "да";
  if (v === false) return "нет";
  if (v === null || v === undefined) return "нет";
  if (typeof v === "object") {
    return Object.entries(v as Record<string, unknown>)
      .map(([k, x]) =>
        x && typeof x === "object" && "from" in (x as object)
          ? `${k}: ${String((x as { from: unknown }).from)} → ${String((x as { to: unknown }).to)}`
          : typeof x === "string" && k !== "from" && k !== "to"
            ? `${k}: ${x}`
            : `${k}: ${JSON.stringify(x)}`,
      )
      .join("; ");
  }
  return String(v);
}

export default function Page_() {
  return (
    <RequirePerm perm="audit.view">
      <AuditPage />
    </RequirePerm>
  );
}

function AuditPage() {
  const [cat, setCat] = useState<Cat>("");
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<AuditEntry> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  const load = useCallback(() => {
    setError(null);
    staffApi
      .audit({ category: cat, q: dq, page })
      .then(setData)
      .catch((e) => setError(`${(e as Error).message} Попробуйте ещё раз.`));
  }, [cat, dq, page]);
  useEffect(load, [load]);
  useEffect(() => setPage(1), [cat, dq]);

  return (
    <>
      <PageHeader
        title="Журнал действий"
        sub="Каждое изменение, сделанное командой: кто, что, когда и откуда. Записи нельзя изменить или удалить."
      />
      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="Сотрудник, объект или ID" label="Поиск в журнале" />
        <SelectBox<Cat> label="Раздел" value={cat} onChange={setCat} options={CATS} />
      </Toolbar>
      {error && <LoadError text={error} onRetry={load} />}
      <Card as="section" padded={false}>
        {!data ? (
          <div className={s.listPad}>
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} height={48} radius={14} />
            ))}
          </div>
        ) : data.results.length ? (
          <>
            <div className={s.rows} role="list">
              {data.results.map((e) => {
                const isOpen = open === e.id;
                const details = Object.entries(e.details || {});
                return (
                  <div key={e.id} role="listitem" className={s.auditItem}>
                    <button type="button" className={`${s.rowBtn} ${s.auditRow}`} aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : e.id)}>
                      <time className={s.auditTime}>{dateTime(e.at)}</time>
                      <span className={s.auditWho}>
                        <strong>{e.actor.alias || "система"}</strong>
                        <RoleBadge role={(e.actor.role as StaffRole) || null} />
                      </span>
                      <span className={s.auditWhat}>
                        {actionLabel(e.action)}
                        {e.target.label && <span className={s.muted}> {e.target.label}</span>}
                      </span>
                      <span className={`${s.muted} ${s.hideSm}`}>{e.ip ?? ""}</span>
                    </button>
                    {isOpen && (
                      <dl className={s.auditDetails}>
                        <div>
                          <dt>Код действия</dt>
                          <dd>
                            <code className={s.code}>{e.action}</code>
                          </dd>
                        </div>
                        {e.target.id && (
                          <div>
                            <dt>Объект</dt>
                            <dd>
                              <code className={s.code}>
                                {e.target.type}:{e.target.id}
                              </code>
                            </dd>
                          </div>
                        )}
                        {details.map(([k, v]) => (
                          <div key={k}>
                            <dt>{DETAIL_LABEL[k] ?? k}</dt>
                            <dd>{detailValue(v)}</dd>
                          </div>
                        ))}
                        <div>
                          <dt>IP и браузер</dt>
                          <dd>
                            {e.ip ?? "нет данных"}
                            {e.user_agent ? `, ${e.user_agent}` : ""}
                          </dd>
                        </div>
                      </dl>
                    )}
                  </div>
                );
              })}
            </div>
            <Pager page={data.page} pages={data.pages} count={data.count} onPage={setPage} noun={["запись", "записи", "записей"]} />
          </>
        ) : (
          <EmptyState art={<EmptyArt scene="moon" />} icon={<ScrollText size={22} />} title="Записей нет" text="Здесь появятся действия сотрудников: блокировки, решения по заявкам, возвраты." />
        )}
      </Card>
    </>
  );
}
