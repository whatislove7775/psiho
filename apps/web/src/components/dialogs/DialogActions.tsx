"use client";

import { t, tj } from "@/lib/i18n";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { Button, Modal, useToast } from "@/ui";
import { ApiError } from "@/lib/api/client";
import type { CallBrief, ChatRole, ProposalBrief } from "@/lib/api/chat";
import { dialogsApi, type CallInfo, type DialogDetail } from "@/lib/api/dialogs";
import { rub } from "@/lib/format";
import { CallPicker } from "./CallPicker";
import { PayCall } from "./PayCall";
import { hm, weekdayDay } from "./time";
import s from "./dialogs.module.css";

export interface DialogActionsValue {
  detail: DialogDetail | null;
  role: ChatRole;
  /** freshest known state of a call (detail beats the card snapshot) */
  call: (c: CallBrief) => CallInfo | CallBrief;
  openBook: () => void;
  openPropose: () => void;
  openReschedule: (c: CallBrief) => void;
  openCancel: (c: CallBrief) => void;
  openPay: (c: CallBrief) => void;
  accept: (p: ProposalBrief) => Promise<void>;
  closeProposal: (p: ProposalBrief) => Promise<void>;
  busy: string | null;
}

const Ctx = createContext<DialogActionsValue | null>(null);

export const useDialogActions = () => useContext(Ctx);

export function DialogActionsProvider({ value, children }: { value: DialogActionsValue | null; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function errText(e: unknown, fallback: string) {
  return e instanceof ApiError ? e.message : fallback;
}

/** All call actions of one dialogue + their modals. */
export function useDialogController(detail: DialogDetail | null, reload: () => Promise<void> | void) {
  const toast = useToast();
  const [picker, setPicker] = useState<null | { mode: "book" | "propose" } | { mode: "reschedule"; call: CallBrief }>(null);
  const [cancelling, setCancelling] = useState<CallInfo | CallBrief | null>(null);
  const [paying, setPaying] = useState<CallInfo | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const id = detail?.id ?? "";
  const role: ChatRole = detail?.my_role ?? "client";

  const callOf = useCallback(
    (c: CallBrief): CallInfo | CallBrief => detail?.calls.find((x) => x.id === c.id) ?? c,
    [detail],
  );

  const afterBooked = useCallback(
    async (call: CallInfo) => {
      await reload();
      if (call.status === "awaiting_payment") {
        if (call.payment_url) {
          window.location.href = call.payment_url;
          return;
        }
        setPaying(call);
        return;
      }
      toast(call.is_intro ? t("Знакомство назначено") : t("Созвон назначен"));
    },
    [reload, toast],
  );

  const value: DialogActionsValue | null = useMemo(
    () =>
      detail
        ? {
            detail,
            role,
            call: callOf,
            openBook: () => setPicker({ mode: "book" }),
            openPropose: () => setPicker({ mode: "propose" }),
            openReschedule: (c) => setPicker({ mode: "reschedule", call: c }),
            openCancel: (c) => setCancelling(callOf(c)),
            openPay: (c) => {
              const full = callOf(c) as CallInfo;
              if (full.payment_url) window.location.href = full.payment_url;
              else setPaying(full);
            },
            accept: async (p) => {
              setBusy(p.id);
              try {
                const call = await dialogsApi.accept(id, p.id);
                await afterBooked(call);
              } catch (e) {
                toast(errText(e, t("Не\u00a0получилось принять предложение")), { error: true });
              } finally {
                setBusy(null);
              }
            },
            closeProposal: async (p) => {
              setBusy(p.id);
              try {
                await dialogsApi.closeProposal(id, p.id);
                await reload();
              } catch (e) {
                toast(errText(e, t("Не\u00a0получилось")), { error: true });
              } finally {
                setBusy(null);
              }
            },
            busy,
          }
        : null,
    [detail, role, callOf, id, afterBooked, reload, toast, busy],
  );

  const doCancel = async () => {
    if (!cancelling || !detail) return;
    setBusy(cancelling.id);
    try {
      const res = await dialogsApi.cancel(id, cancelling.id);
      setCancelling(null);
      await reload();
      toast(
        res.refund === "full"
          ? t("Созвон отменён, деньги вернутся полностью")
          : res.refund === "partial"
            ? t("Созвон отменён")
            : t("Созвон отменён"),
      );
    } catch (e) {
      toast(errText(e, t("Не\u00a0получилось отменить")), { error: true });
    } finally {
      setBusy(null);
    }
  };

  const rules = detail?.rules;
  const cancelInfo = cancelling ? (callOf(cancelling) as CallInfo) : null;
  const late = !!cancelInfo?.late_cancel;
  const paid = cancelInfo?.status === "paid";

  const modals = detail ? (
    <>
      <CallPicker
        open={!!picker}
        onClose={() => setPicker(null)}
        dialogId={id}
        title={
          picker?.mode === "propose" ? t("Предложить время созвона") : picker?.mode === "reschedule" ? t("Перенести созвон") : t("Назначить созвон")
        }
        durations={detail.booking.durations}
        intro={picker?.mode === "book" ? detail.booking.intro : undefined}
        fixedMinutes={picker?.mode === "reschedule" ? picker.call.duration_minutes : undefined}
        submitLabel={(price) =>
          picker?.mode === "propose" ? t("Отправить предложение") : picker?.mode === "reschedule" ? t("Перенести") : price
                ? t(`Назначить за\u00a0{rub}`, { rub: rub(price) })
                : t("Назначить бесплатно")
        }
        note={
          picker?.mode === "propose"
            ? t("Клиент увидит карточку в\u00a0диалоге и\u00a0сможет принять время и\u00a0оплатить его.")
            : picker?.mode === "book" && rules
              ? t(`Отменить или\u00a0перенести бесплатно можно за\u00a0{free_cancel_hours} ч\u00a0до\u00a0начала.`, { free_cancel_hours: rules.free_cancel_hours })
              : undefined
        }
        onSubmit={async (start, minutes) => {
          try {
            if (picker?.mode === "propose") {
              await dialogsApi.propose(id, start, minutes);
              setPicker(null);
              await reload();
              toast(t("Предложение отправлено"));
            } else if (picker?.mode === "reschedule") {
              await dialogsApi.reschedule(id, picker.call.id, start);
              setPicker(null);
              await reload();
              toast(t("Созвон перенесён"));
            } else {
              const call = await dialogsApi.book(id, start, minutes);
              setPicker(null);
              await afterBooked(call);
            }
          } catch (e) {
            if (e instanceof ApiError && e.status === 400) return t(`{message} Свободное время обновлено.`, { message: e.message });
            return errText(e, t("Не\u00a0получилось, попробуйте ещё раз"));
          }
        }}
      />

      <Modal open={!!cancelling} onClose={() => !busy && setCancelling(null)} title={t("Отменить созвон?")} width={460}>
        {cancelInfo && (
          <>
            <p className={s.modalText}>
              {weekdayDay(cancelInfo.scheduled_at)}, {hm(cancelInfo.scheduled_at)}.{" "}
              {role === "specialist"
                ? paid
                  ? t("Клиенту вернутся все деньги за\u00a0созвон. Мы\u00a0сообщим ему в\u00a0диалоге.")
                  : t("Клиент увидит отмену в\u00a0диалоге.")
                : !paid
                  ? t("Созвон ещё не\u00a0оплачен, списаний не\u00a0будет.")
                  : late
                    ? t(`До\u00a0начала меньше {v} ч, поэтому {v2}. Перенести созвон может только специалист\u00a0— напишите ему.`, { v: rules?.free_cancel_hours ?? 24, v2: rules?.late_penalty_percent != null
                          ? t(`вернётся {v}% стоимости`, { v: 100 - rules.late_penalty_percent })
                          : t("деньги могут не\u00a0вернуться") })
                    : t(`Деньги ({rub}) вернутся полностью.`, { rub: rub(cancelInfo.amount_rub) })}{" "}
              {t("Время освободится для\u00a0других.")}
            </p>
            <div className={s.modalActions}>
              <Button variant="secondary" onClick={() => setCancelling(null)} disabled={!!busy}>
                {t("Оставить")}
              </Button>
              <Button variant="danger" onClick={doCancel} loading={busy === cancelInfo.id}>
                {t("Отменить созвон")}
              </Button>
            </div>
          </>
        )}
      </Modal>

      <Modal open={!!paying} onClose={() => setPaying(null)} title={t("Оплата созвона")} width={440}>
        {paying && (
          <>
            <p className={s.modalText}>
              {tj("{weekdayDay}, {hm}, {duration_minutes} мин. Время за\u00a0вами, пока идёт оплата.", { weekdayDay: weekdayDay(paying.scheduled_at), hm: hm(paying.scheduled_at), duration_minutes: paying.duration_minutes })}
            </p>
            <div style={{ marginTop: 16 }}>
              <PayCall
                sessionId={paying.id}
                amountRub={paying.amount_rub}
                paymentUrl={paying.payment_url}
                onPaid={async () => {
                  setPaying(null);
                  await reload();
                  toast(t("Созвон оплачен"));
                }}
              />
            </div>
          </>
        )}
      </Modal>
    </>
  ) : null;

  return { value, modals };
}
