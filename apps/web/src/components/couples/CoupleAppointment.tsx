"use client";
import { useState, useEffect } from "react";
import { t, lp } from "@/lib/i18n";
import { circlesApi, rubK0 } from "@/lib/api/circles";
import { couplesApi } from "@/lib/api/couples";
import { useLoad, errorText } from "@/components/client/useLoad";
import { ErrorBlock } from "@/components/client/ClientBits";
import { Button, Card, Modal, Skeleton, Input } from "@/ui";
import { dayLabel, time } from "@/lib/format";
import s from "./couples.module.css";
import { coupleStatus } from "./status";
export function CoupleAppointment({ id }: { id: string }) {
  const data = useLoad(() => circlesApi.get(id), [id]);
  const [link, setLink] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const c = data.data;
  const m = c?.meetings[0];
  const [now, setNow] = useState(Date.now());
  const reload = data.reload;
  useEffect(() => {
    if (!c || c.status === "cancelled" || c.status === "finished") return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        setNow(Date.now());
        reload();
      }
    }, 30000);
    return () => window.clearInterval(timer);
  }, [c?.status, reload]);
  async function invite() {
    setBusy(true);
    setError("");
    try {
      const v = await couplesApi.invite(id);
      setLink(`${window.location.origin}${lp("/couples/invite")}#${v.token}`);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function cancel() {
    setBusy(true);
    setError("");
    try {
      data.setData(await couplesApi.cancel(id));
      setLink("");
      setConfirm(false);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  if (data.error)
    return <ErrorBlock message={data.error} onRetry={data.reload} />;
  if (!c) return <Skeleton height={260} />;
  if (c.kind !== "couple") return <p>{t("Встреча не найдена.")}</p>;
  const open = c.status !== "cancelled" && c.status !== "finished";
  return (
    <div className={s.page}>
      <h1>{t("Консультация для пары")}</h1>
      <Card className={s.stack}>
        <h2>{c.host.name}</h2>
        <p>{coupleStatus(c.status)}</p>
        {m && (
          <p>
            {dayLabel(m.starts_at)}, {time(m.starts_at)} — {time(m.ends_at)}
          </p>
        )}
        <p>
          {rubK0(c.price_kopecks)} — {t("за всю встречу")}
        </p>
        <p className={s.note}>
          {t(
            "Общая комната доступна только вам двоим и психологу. Личные диалоги и история аккаунтов партнёру не показываются.",
          )}
        </p>
        <p>
          {c.seats_taken === 2
            ? t("Партнёр принял приглашение")
            : t("Ожидаем приглашение партнёра")}
        </p>
        <div className={s.actions}>
          {open && m?.room_open && (
            <Button href={`/circle-room/${m.id}`} variant="primary">
              {t("Войти во встречу")}
            </Button>
          )}
          {open && c.is_organizer && c.seats_taken < 2 && (
            <Button onClick={invite} loading={busy} variant="secondary">
              {link ? t("Заменить приглашение") : t("Пригласить партнёра")}
            </Button>
          )}
          {open && m && new Date(m.starts_at).getTime() > now && (
            <Button variant="ghost" onClick={() => setConfirm(true)}>
              {t("Отменить встречу")}
            </Button>
          )}
        </div>
        {link && (
          <div className={s.stack}>
            <Input
              aria-label={t("Приглашение партнёра")}
              readOnly
              value={link}
              className={s.link}
            />
            <Button
              variant="secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link);
                } catch {
                  setError(
                    t(
                      "Не удалось скопировать. Выделите ссылку и скопируйте вручную.",
                    ),
                  );
                }
              }}
            >
              {t("Скопировать приглашение")}
            </Button>
            <p className={s.note}>
              {t(
                "Передайте ссылку только партнёру. Она действует до начала встречи и принимается один раз. Новая ссылка отключает предыдущую.",
              )}
            </p>
          </div>
        )}
        {error && <p role="alert">{error}</p>}
      </Card>
      <Modal
        open={confirm}
        onClose={() => !busy && setConfirm(false)}
        title={t("Отменить встречу для пары?")}
      >
        <div className={s.stack}>
          <p>{t("Встреча отменится для обоих партнёров.")}</p>
          {c.couple_cancel_terms && (
            <p>
              {t("На баланс оплатившего вернётся")}{" "}
              {rubK0(
                c.my_role === "host"
                  ? c.price_kopecks
                  : c.couple_cancel_terms.refund_kopecks,
              )}
              . {t("Штраф за позднюю отмену")}{" "}
              {rubK0(
                c.my_role === "host"
                  ? 0
                  : c.couple_cancel_terms.penalty_kopecks,
              )}
              .
            </p>
          )}
          <div className={s.actions}>
            <Button onClick={() => setConfirm(false)} variant="secondary">
              {t("Оставить встречу")}
            </Button>
            <Button onClick={cancel} variant="danger" loading={busy}>
              {t("Отменить для обоих")}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
