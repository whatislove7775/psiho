"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, ExternalLink, FileCheck2, FileText, HelpCircle, ImageIcon, RotateCcw, X } from "lucide-react";
import { Badge, Button, Card, EmptyState, Segmented, Skeleton, useToast } from "@/ui";
import { PageHeader } from "@/components/shell/AppShell";
import { SpecialistPhoto } from "@/components/avatar/SpecialistPhoto";
import { RequirePerm } from "@/components/admin/AdminShell";
import { KV, Pager, ReasonModal, SearchBox, Toolbar, ago, dateTime, useDebounced } from "@/components/admin/kit";
import { LoadError } from "@/components/pro/controls";
import { DocFrame } from "@/components/credentials/DocViewer";
import { KindIcon } from "@/components/credentials/kinds";
import {
  STATUS_LABEL,
  STATUS_TONE,
  credentialsApi,
  fileSize,
  periodLabel,
  type CredentialStatus,
  type StaffCredential,
} from "@/lib/api/credentials";
import { EmptyArt } from "@/components/illustrations";
import cs from "@/components/credentials/credentials.module.css";
import s from "./page.module.css";

const TABS: { value: CredentialStatus; label: string; empty: string }[] = [
  { value: "pending", label: "На проверке", empty: "Все документы проверены. Новые появятся здесь, как только специалист их отправит." },
  { value: "needs_info", label: "Ждём ответа", empty: "Нет документов, по которым ждём уточнений от специалиста." },
  { value: "approved", label: "Подтверждены", empty: "Подтверждённых документов пока нет." },
  { value: "rejected", label: "Отклонены", empty: "Отклонённых документов нет." },
];

type Decision = "approve" | "reject" | "request_info";
const DECISION: Record<Decision, { title: string; text: string; confirm: string; variant: "primary" | "danger"; label: string; done: string }> = {
  approve: {
    title: "Подтвердить документ?",
    text: "Пункт появится на странице специалиста. Публично покажем только файлы, которые специалист отметил публичными.",
    confirm: "Подтвердить",
    variant: "primary",
    label: "Комментарий для специалиста",
    done: "Документ подтверждён",
  },
  request_info: {
    title: "Запросить уточнение",
    text: "Специалист увидит вопрос в профиле и сможет ответить или приложить файл. После ответа пункт вернётся в очередь.",
    confirm: "Отправить вопрос",
    variant: "primary",
    label: "Что нужно уточнить",
    done: "Вопрос отправлен специалисту",
  },
  reject: {
    title: "Отклонить документ?",
    text: "Специалист увидит причину. Если он исправит пункт, тот снова попадёт в очередь.",
    confirm: "Отклонить",
    variant: "danger",
    label: "Причина для специалиста",
    done: "Документ отклонён",
  },
};

export default function Page_() {
  return (
    <RequirePerm perm="specialists.verify">
      <Suspense fallback={null}>
        <CredentialsQueue />
      </Suspense>
    </RequirePerm>
  );
}

function CredentialsQueue() {
  const toast = useToast();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const initial = params.get("status") as CredentialStatus | null;
  const [tab, setTab] = useState<CredentialStatus>(initial && TABS.some((t) => t.value === initial) ? initial : "pending");
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Awaited<ReturnType<typeof credentialsApi.staffList>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(params.get("id"));
  const [confirm, setConfirm] = useState<Decision | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setError(null);
    credentialsApi
      .staffList({ status: tab, q: dq, page })
      .then((d) => {
        setData(d);
        setOpenId((cur) => (cur && d.results.some((x) => x.id === cur) ? cur : d.results[0]?.id ?? null));
      })
      .catch((e) => setError(`${(e as Error).message} Попробуйте ещё раз.`));
  }, [tab, dq, page]);
  useEffect(load, [load]);

  const changeTab = (t: CredentialStatus) => {
    setTab(t);
    setPage(1);
    setData(null);
    setOpenId(null);
    router.replace(`${pathname}?status=${t}`, { scroll: false });
  };

  const current = data?.results.find((x) => x.id === openId) ?? null;

  const decide = async (comment: string) => {
    if (!confirm || !current) return;
    setBusy(true);
    try {
      await credentialsApi.staffDecide(current.id, confirm, comment);
      toast(`${DECISION[confirm].done}: ${current.specialist.display_name}`);
      setConfirm(null);
      setOpenId(null);
      load();
    } catch (e) {
      toast(`${(e as Error).message} Статус не изменился.`, { error: true });
    } finally {
      setBusy(false);
    }
  };

  const tabInfo = TABS.find((t) => t.value === tab)!;

  return (
    <>
      <PageHeader
        title="Документы специалистов"
        sub="Клиенты видят только подтверждённое"
      />
      <div className={s.top}>
        <Segmented<CredentialStatus>
          ariaLabel="Статус документов"
          value={tab}
          onChange={changeTab}
          options={TABS.map((t) => ({ value: t.value, label: data?.counts?.[t.value] ? `${t.label} ${data.counts[t.value]}` : t.label }))}
        />
        <Toolbar>
          <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Специалист, документ, организация" label="Поиск документов" />
        </Toolbar>
      </div>
      {error && <LoadError text={error} onRetry={load} />}

      {!data ? (
        <div className={s.layout}>
          <Card>
            <div className={s.list}>
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} height={64} radius={16} />
              ))}
            </div>
          </Card>
          <Card>
            <Skeleton height={420} radius={18} />
          </Card>
        </div>
      ) : data.results.length === 0 ? (
        <Card>
          <EmptyState art={<EmptyArt scene="shield" />} icon={<FileCheck2 size={22} />} title={tab === "pending" ? "Очередь пуста" : "Здесь пока пусто"} text={q ? "По этому запросу ничего нет." : tabInfo.empty} />
        </Card>
      ) : (
        <div className={s.layout}>
          <Card className={s.listCard} padded={false}>
            <div className={s.list} role="listbox" aria-label="Документы">
              {data.results.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="option"
                  aria-selected={c.id === openId}
                  className={s.row}
                  onClick={() => setOpenId(c.id)}
                >
                  <SpecialistPhoto url={c.specialist.photo_url} name={c.specialist.display_name} size={40} />
                  <span className={s.rowMain}>
                    <span className={s.rowName}>{c.specialist.display_name}</span>
                    <span className={s.rowTitle}>
                      {c.kind_label}: {c.title}
                    </span>
                    <span className={s.rowMeta}>
                      {tab === "pending" ? `ждёт ${ago(c.submitted_at).replace(" назад", "")}` : c.reviewed_at ? dateTime(c.reviewed_at) : ""}
                      {c.was_approved && tab === "pending" ? ", повторно" : ""}
                      {c.files.length ? `, ${c.files.length} ${c.files.length === 1 ? "файл" : c.files.length < 5 ? "файла" : "файлов"}` : ", без файлов"}
                    </span>
                  </span>
                </button>
              ))}
            </div>
            <div className={s.pager}>
              <Pager page={data.page} pages={data.pages} count={data.count} onPage={setPage} noun={["документ", "документа", "документов"]} />
            </div>
          </Card>
          {current ? <Detail key={current.id} c={current} onDecide={setConfirm} /> : <Card><Skeleton height={420} /></Card>}
        </div>
      )}

      <ReasonModal
        open={!!confirm}
        title={confirm ? DECISION[confirm].title : ""}
        text={confirm ? DECISION[confirm].text : ""}
        confirm={confirm ? DECISION[confirm].confirm : ""}
        variant={confirm ? DECISION[confirm].variant : "primary"}
        requireReason={confirm !== "approve"}
        reasonLabel={confirm ? DECISION[confirm].label : ""}
        reasonHint={confirm && confirm !== "approve" ? "Специалист увидит текст в профиле. Пишите спокойно и по делу, без внутренних деталей." : undefined}
        busy={busy}
        onClose={() => setConfirm(null)}
        onConfirm={decide}
      >
        {current && (
          <div className={s.confirmHead}>
            <KindIcon kind={current.kind} className={cs.kindIcon} size={18} />
            <span>
              <strong>{current.title}</strong>
              <small>{current.specialist.display_name}</small>
            </span>
          </div>
        )}
      </ReasonModal>
    </>
  );
}

function Detail({ c, onDecide }: { c: StaffCredential; onDecide: (d: Decision) => void }) {
  const [fileIdx, setFileIdx] = useState(0);
  const file = c.files[fileIdx] ?? null;
  const rows: [string, React.ReactNode][] = [
    ["Тип", c.kind_label],
    ["Название", c.title],
  ];
  if (c.issuer) rows.push([c.kind === "publication" ? "Журнал" : "Организация", c.issuer]);
  if (c.supervisor) rows.push(["Супервизор", c.supervisor]);
  if (periodLabel(c)) rows.push([c.year_end ? "Период" : "Год", periodLabel(c)]);
  if (c.hours) rows.push(["Часов", c.hours]);
  if (c.number) rows.push(["Номер", <span className={s.mono} key="n">{c.number}</span>]);
  if (c.doi) rows.push(["DOI", <a key="doi" href={`https://doi.org/${c.doi}`} target="_blank" rel="noopener noreferrer nofollow">{c.doi} <ExternalLink size={12} /></a>]);
  if (c.url) rows.push(["Ссылка", <a key="url" href={c.url} target="_blank" rel="noopener noreferrer nofollow" className={s.link}>{c.url}</a>]);
  rows.push(["Отправлен", `${dateTime(c.submitted_at)}${c.was_approved ? ", повторная проверка" : ""}`]);
  if (c.reviewed_by) rows.push(["Решение", `${c.reviewed_by}, ${dateTime(c.reviewed_at)}`]);

  return (
    <Card className={s.detail}>
      <div className={s.viewer}>
        {c.files.length > 1 && (
          <div className={s.fileTabs} role="tablist" aria-label="Файлы документа">
            {c.files.map((f, i) => (
              <button key={f.id} type="button" role="tab" aria-selected={i === fileIdx} className={s.fileTab} onClick={() => setFileIdx(i)}>
                {f.kind === "pdf" ? <FileText size={14} /> : <ImageIcon size={14} />}
                <span>{f.name ?? `Файл ${i + 1}`}</span>
              </button>
            ))}
          </div>
        )}
        <div className={s.stage}>
          {file ? (
            <DocFrame key={file.id} file={file} title={file.name ?? c.title} />
          ) : (
            <div className={cs.frameState}>
              <FileText size={28} strokeWidth={1.6} aria-hidden />
              <p>Файлов нет. {c.kind === "publication" ? "Проверьте публикацию по ссылке или DOI." : "Запросите скан у специалиста."}</p>
            </div>
          )}
        </div>
        {file && (
          <div className={s.fileMeta}>
            <span>
              {file.name}, {fileSize(file.size)}
              {file.width ? `, ${file.width}×${file.height}` : ""}
            </span>
            <Badge tone={file.is_public ? "mint" : "neutral"}>{file.is_public ? "Станет публичным" : "Только для проверки"}</Badge>
          </div>
        )}
      </div>

      <div className={s.side}>
        <div className={s.who}>
          <SpecialistPhoto url={c.specialist.photo_url} name={c.specialist.display_name} size={44} />
          <span>
            <a href={`/admin/specialists?status=${c.specialist.verification_status}`} className={s.whoName}>
              {c.specialist.display_name}
            </a>
            <small>Опыт {c.specialist.experience_years} лет</small>
          </span>
          <Badge tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</Badge>
        </div>
        <KV items={rows} />
        {c.reject_reason && c.status === "rejected" && (
          <div className={cs.alert}>
            <X size={16} />
            <span>Причина: {c.reject_reason}</span>
          </div>
        )}
        {c.notes.length > 0 && (
          <div className={cs.thread}>
            {c.notes.map((n) => (
              <div key={n.id} className={cs.note} data-role={n.author_role === "staff" ? "specialist" : n.author_role === "specialist" ? "staff" : "system"}>
                {n.author_role !== "system" && <span className={cs.noteWho}>{n.author_role === "staff" ? n.author : "Специалист"}</span>}
                {n.text}
              </div>
            ))}
          </div>
        )}
        <div className={s.decisions}>
          {c.status !== "approved" && (
            <Button variant="primary" icon={<Check size={18} />} onClick={() => onDecide("approve")}>
              Подтвердить
            </Button>
          )}
          {c.status === "approved" && (
            <Button variant="secondary" icon={<RotateCcw size={18} />} onClick={() => onDecide("request_info")}>
              Снять и уточнить
            </Button>
          )}
          {c.status !== "approved" && (
            <Button variant="secondary" icon={<HelpCircle size={18} />} onClick={() => onDecide("request_info")}>
              Уточнить
            </Button>
          )}
          {c.status !== "rejected" && (
            <Button variant="ghost" icon={<X size={18} />} onClick={() => onDecide("reject")}>
              Отклонить
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
