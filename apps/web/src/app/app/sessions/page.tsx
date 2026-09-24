"use client";

import { useMemo, useState } from "react";
import { CalendarPlus, History, Video } from "lucide-react";
import {
  Button,
  Card,
  EmptyState,
  Modal,
  Segmented,
  Skeleton,
  useToast,
} from "@/ui";
import { PageHeader, WithRail } from "@/components/shell/AppShell";
import { sessionsApi } from "@/lib/api/endpoints";
import type { Session } from "@/lib/api/types";
import { rub, when } from "@/lib/format";
import { useLoad, errorText } from "@/components/client/useLoad";
import { canCancel, splitSessions } from "@/components/client/sessions";
import {
  ErrorBlock,
  RowList,
  SessionRow,
  clientStyles as cs,
} from "@/components/client/ClientBits";
import { NextSessionCard } from "@/components/client/NextSessionCard";
import s from "./sessions.module.css";

type Tab = "upcoming" | "past";

export default function SessionsPage() {
  const toast = useToast();
  const res = useLoad(() => sessionsApi.list());
  const [tab, setTab] = useState<Tab>("upcoming");
  const [cancelling, setCancelling] = useState<Session | null>(null);
  const [busy, setBusy] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const { upcoming, past } = useMemo(
    () => splitSessions(res.data ?? []),
    [res.data],
  );
  const list = tab === "upcoming" ? upcoming : past;

  const doCancel = async () => {
    if (!cancelling) return;
    setBusy(true);
    setCancelError(null);
    try {
      const updated = await sessionsApi.cancel(cancelling.id);
      res.setData(
        (res.data ?? []).map((x) => (x.id === updated.id ? updated : x)),
      );
      setCancelling(null);
      toast("Сессия отменена");
    } catch (e) {
      setCancelError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const actionsFor = (x: Session) => {
    const out = [];
    if (x.can_join)
      out.push(
        <Button
          key="join"
          variant="primary"
          size="sm"
          href={`/room/${x.id}`}
          icon={<Video size={16} strokeWidth={1.8} />}
        >
          Войти
        </Button>,
      );
    if (x.status === "awaiting_payment" && x.payment_url)
      out.push(
        <Button
          key="pay"
          variant="primary"
          size="sm"
          onClick={() => (window.location.href = x.payment_url!)}
        >
          Оплатить
        </Button>,
      );
    if (canCancel(x) && !x.can_join)
      out.push(
        <Button
          key="cancel"
          variant="ghost"
          size="sm"
          onClick={() => {
            setCancelError(null);
            setCancelling(x);
          }}
        >
          Отменить
        </Button>,
      );
    if (x.status === "completed")
      out.push(
        <Button
          key="again"
          variant="secondary"
          size="sm"
          href={`/app/specialists/${x.psychologist.id}`}
        >
          Записаться снова
        </Button>,
      );
    return out.length ? out : null;
  };

  return (
    <>
      <PageHeader
        title="Мои сессии"
        sub="Войти можно за 10 минут до начала. Отменить запись можно, пока сессия не началась."
        action={
          <Button
            variant="primary"
            href="/app/specialists"
            icon={<CalendarPlus size={18} strokeWidth={1.8} />}
          >
            Записаться
          </Button>
        }
      />
      <WithRail
        rail={
          <div className={s.wideOnly}>
            <NextSessionCard
              session={upcoming[0] ?? null}
              loading={res.loading && !res.data}
              showAllLink={false}
            />
          </div>
        }
      >
        <Card as="section">
          <div className={s.top}>
            <Segmented<Tab>
              ariaLabel="Какие сессии показать"
              value={tab}
              onChange={setTab}
              options={[
                {
                  value: "upcoming",
                  label: `Предстоящие${res.data ? ` ${upcoming.length}` : ""}`,
                },
                {
                  value: "past",
                  label: `Прошедшие${res.data ? ` ${past.length}` : ""}`,
                },
              ]}
            />
          </div>

          {res.error ? (
            <ErrorBlock message={res.error} onRetry={res.reload} />
          ) : res.loading && !res.data ? (
            <div className={s.skel}>
              {[0, 1, 2].map((i) => (
                <div key={i} className={s.skelRow}>
                  <Skeleton width={56} height={56} radius={28} />
                  <div style={{ flex: 1, display: "grid", gap: 8 }}>
                    <Skeleton width="40%" height={18} />
                    <Skeleton width="60%" height={14} />
                  </div>
                </div>
              ))}
            </div>
          ) : list.length === 0 ? (
            tab === "upcoming" ? (
              <EmptyState
                icon={<CalendarPlus size={24} strokeWidth={1.8} />}
                title="Пока ничего не запланировано"
                text="Выберите специалиста и свободное время. Для первой встречи обычно хватает 50 минут."
                action={
                  <Button variant="primary" href="/app/specialists">
                    Выбрать специалиста
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={<History size={24} strokeWidth={1.8} />}
                title="Здесь появятся прошедшие встречи"
                text="После первой сессии вы сможете быстро записаться к тому же специалисту снова."
                action={
                  upcoming.length ? (
                    <Button
                      variant="secondary"
                      onClick={() => setTab("upcoming")}
                    >
                      Показать предстоящие
                    </Button>
                  ) : undefined
                }
              />
            )
          ) : (
            <RowList>
              {list.map((x) => (
                <SessionRow key={x.id} session={x} actions={actionsFor(x)} />
              ))}
            </RowList>
          )}
        </Card>
      </WithRail>

      <Modal
        open={!!cancelling}
        onClose={() => !busy && setCancelling(null)}
        title="Отменить сессию?"
        width={460}
      >
        {cancelling && (
          <>
            <p className={cs.modalText}>
              {cancelling.psychologist.display_name},{" "}
              {when(cancelling.scheduled_at).toLowerCase()}.{" "}
              {cancelling.status === "paid"
                ? `Мы оформим возврат ${rub(cancelling.amount_rub)}.`
                : "Запись ещё не оплачена, списаний не будет."}{" "}
              Время освободится для других.
            </p>
            {cancelError && (
              <p className={s.err} role="alert">
                {cancelError}
              </p>
            )}
            <div className={cs.modalActions}>
              <Button
                variant="secondary"
                onClick={() => setCancelling(null)}
                disabled={busy}
              >
                Оставить запись
              </Button>
              <Button variant="danger" onClick={doCancel} loading={busy}>
                Отменить сессию
              </Button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
