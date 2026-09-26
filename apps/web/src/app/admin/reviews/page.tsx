"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { EyeOff, MessageSquareQuote, RotateCcw, ShieldCheck } from "lucide-react";
import { Badge, Button, Card, EmptyState, Segmented, Skeleton, useToast } from "@/ui";
import { PageHeader } from "@/components/shell/AppShell";
import { RequirePerm, useStaff } from "@/components/admin/AdminShell";
import { Pager, ReasonModal, dateTime } from "@/components/admin/kit";
import { LoadError } from "@/components/pro/controls";
import { ReviewItem } from "@/components/reviews/ReviewsSection";
import { reviewsApi, type StaffReview } from "@/lib/api/reviews";
import { EmptyArt } from "@/components/illustrations";
import s from "./page.module.css";

type Tab = "reported" | "hidden" | "all";
const TABS: { value: Tab; label: string; empty: string }[] = [
  { value: "reported", label: "С жалобами", empty: "Жалоб на отзывы нет." },
  { value: "hidden", label: "Скрытые", empty: "Скрытых отзывов нет." },
  { value: "all", label: "Все", empty: "Отзывов пока нет." },
];

export default function Page_() {
  return (
    <RequirePerm perm="reports.view">
      <Suspense fallback={null}>
        <ReviewsModeration />
      </Suspense>
    </RequirePerm>
  );
}

function ReviewsModeration() {
  const { can } = useStaff();
  const toast = useToast();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const initial = params.get("status") as Tab | null;
  const [tab, setTab] = useState<Tab>(initial && TABS.some((t) => t.value === initial) ? initial : "reported");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Awaited<ReturnType<typeof reviewsApi.staffList>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [act, setAct] = useState<{ r: StaffReview; action: "hide" | "restore" | "keep" } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setError(null);
    reviewsApi
      .staffList({ status: tab, page })
      .then(setData)
      .catch((e) => setError(`${(e as Error).message} Попробуйте ещё раз.`));
  }, [tab, page]);
  useEffect(load, [load]);

  const changeTab = (t: Tab) => {
    setTab(t);
    setPage(1);
    setData(null);
    router.replace(`${pathname}?status=${t}`, { scroll: false });
  };

  const run = async (note: string) => {
    if (!act) return;
    setBusy(true);
    try {
      await reviewsApi.moderate(act.r.id, act.action, note);
      toast(act.action === "hide" ? "Отзыв скрыт" : act.action === "restore" ? "Отзыв снова виден" : "Отзыв оставлен, жалобы отклонены");
      setAct(null);
      load();
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(false);
    }
  };

  const canResolve = can("reports.resolve");
  const info = TABS.find((t) => t.value === tab)!;

  return (
    <>
      <PageHeader
        title="Отзывы"
        sub="Модерация по жалобам"
      />
      <div className={s.tabs}>
        <Segmented<Tab>
          ariaLabel="Какие отзывы показать"
          value={tab}
          onChange={changeTab}
          options={TABS.map((t) => ({ value: t.value, label: data?.counts?.[t.value] ? `${t.label} ${data.counts[t.value]}` : t.label }))}
        />
      </div>
      {error && <LoadError text={error} onRetry={load} />}
      <Card as="section">
        {!data ? (
          <div className={s.list}>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} height={96} radius={18} />
            ))}
          </div>
        ) : data.results.length === 0 ? (
          <EmptyState art={<EmptyArt scene="heart" />} icon={<MessageSquareQuote size={22} />} title="Здесь пусто" text={info.empty} />
        ) : (
          <>
            <div className={s.list}>
              {data.results.map((r) => (
                <div key={r.id} className={s.item} data-hidden={r.status === "hidden" || undefined}>
                  <div className={s.head}>
                    <span>
                      О специалисте <a href={`/app/specialists/${r.specialist.id}`}>{r.specialist.display_name}</a>, автор {r.author.alias}
                    </span>
                    {r.status === "hidden" && <Badge tone="warning">Скрыт</Badge>}
                    <span className={s.date}>{dateTime(r.created_at)}</span>
                  </div>
                  <ReviewItem r={r} />
                  {r.status === "hidden" && r.hidden_reason && <p className={s.note}>Причина скрытия: {r.hidden_reason}</p>}
                  {r.reports.length > 0 && (
                    <ul className={s.reports}>
                      {r.reports.map((rep) => (
                        <li key={rep.id} data-open={rep.status === "open" || rep.status === "in_review" || undefined}>
                          <Badge tone={rep.status === "open" || rep.status === "in_review" ? "danger" : "neutral"}>{rep.reason_label}</Badge>
                          <span>{rep.comment || "Без комментария"}</span>
                          <small>{dateTime(rep.created_at)}</small>
                        </li>
                      ))}
                    </ul>
                  )}
                  {canResolve && (
                    <div className={s.actions}>
                      {r.status === "published" ? (
                        <>
                          {r.reports.some((x) => x.status === "open" || x.status === "in_review") && (
                            <Button variant="secondary" size="sm" icon={<ShieldCheck size={16} />} onClick={() => setAct({ r, action: "keep" })}>
                              Оставить
                            </Button>
                          )}
                          <Button variant="danger" size="sm" icon={<EyeOff size={16} />} onClick={() => setAct({ r, action: "hide" })}>
                            Скрыть
                          </Button>
                        </>
                      ) : (
                        <Button variant="secondary" size="sm" icon={<RotateCcw size={16} />} onClick={() => setAct({ r, action: "restore" })}>
                          Вернуть
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <Pager page={data.page} pages={data.pages} count={data.count} onPage={setPage} noun={["отзыв", "отзыва", "отзывов"]} />
          </>
        )}
      </Card>
      <ReasonModal
        open={!!act}
        title={act?.action === "hide" ? "Скрыть отзыв?" : act?.action === "restore" ? "Вернуть отзыв?" : "Оставить отзыв?"}
        text={
          act?.action === "hide"
            ? "Отзыв пропадёт со страницы специалиста и из рейтинга. Автор увидит причину, открытые жалобы закроются."
            : act?.action === "restore"
              ? "Отзыв снова появится на странице специалиста и в рейтинге."
              : "Отзыв останется опубликованным, жалобы будут отклонены."
        }
        confirm={act?.action === "hide" ? "Скрыть" : act?.action === "restore" ? "Вернуть" : "Оставить"}
        variant={act?.action === "hide" ? "danger" : "primary"}
        requireReason={act?.action === "hide"}
        reasonLabel={act?.action === "hide" ? "Причина для автора" : "Комментарий"}
        busy={busy}
        onClose={() => setAct(null)}
        onConfirm={run}
      />
    </>
  );
}
