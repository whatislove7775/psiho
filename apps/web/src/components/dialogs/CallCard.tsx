"use client";

import { CalendarCheck2, CalendarClock, CalendarX2, CircleCheckBig, PenLine, PhoneCall, Sparkles, Video } from "lucide-react";
import { useState, type ReactNode } from "react";
import { ReviewModal } from "@/components/reviews/ReviewModal";
import { Badge, Button } from "@/ui";
import type { ChatMessage, DialogCard } from "@/lib/api/chat";
import { rub } from "@/lib/format";
import { useDialogActions } from "./DialogActions";
import { CALL_STATUS, isLive, range, weekdayDay } from "./time";
import s from "./dialogs.module.css";

const PROPOSAL_STATUS: Record<string, string> = {
  accepted: "Принято",
  declined: "Клиент отказался",
  withdrawn: "Отозвано",
  expired: "Время прошло",
};

/**
 * System message «call:*» of a dialogue: booked / rescheduled / cancelled / started / ended / proposed.
 * Works without the dialogue context too (in-call side panel): then it only informs and offers «Присоединиться».
 */
export function CallCard({ msg }: { msg: ChatMessage }) {
  const ctx = useDialogActions();
  const card = msg.card as DialogCard;
  const role = ctx?.role;
  const [reviewing, setReviewing] = useState(false);
  const reviewFor = ctx?.detail?.counterpart.psychologist_id ?? null;
  const at = new Date(msg.created_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });

  const snapshot = card.call;
  const call = snapshot ? ctx?.call(snapshot) ?? snapshot : null;
  const live = !!call && isLive(call) && card.type !== "cancelled" && card.type !== "ended";
  const joinBtn =
    call && live ? (
      <Button variant="white" size="sm" href={`/room/${call.id}`} icon={<Video size={16} strokeWidth={1.8} />}>
        Присоединиться
      </Button>
    ) : null;

  let icon: ReactNode = <CalendarCheck2 size={20} strokeWidth={1.8} />;
  let iconTone: string | undefined;
  let title = "";
  let sub: ReactNode = null;
  let tone: "live" | "muted" | undefined;
  let actions: ReactNode = null;
  let badge: ReactNode = null;

  const when = call ? `${weekdayDay(call.scheduled_at)}, ${range(call.scheduled_at, call.duration_minutes)}` : "";
  const byLabel = (by?: string) => (by === "specialist" ? (role === "specialist" ? "вы" : "специалист") : role === "client" ? "вы" : "клиент");

  switch (card.type) {
    case "booked": {
      title = call?.is_intro ? "Знакомство назначено" : "Созвон назначен";
      sub = call ? `${when}, ${call.duration_minutes} мин` : null;
      if (call && call.status !== "paid") {
        const st = CALL_STATUS[call.status];
        badge = st ? <Badge tone={st.tone}>{st.label}</Badge> : null;
      }
      if (live) {
        tone = "live";
        actions = joinBtn;
      } else if (call?.status === "cancelled") {
        tone = "muted";
      } else if (call?.status === "awaiting_payment" && role === "client" && ctx) {
        actions = (
          <Button variant="primary" size="sm" onClick={() => ctx.openPay(call)}>
            Оплатить {rub(call.amount_rub)}
          </Button>
        );
      }
      break;
    }
    case "rescheduled":
      icon = <CalendarClock size={20} strokeWidth={1.8} />;
      iconTone = "lilac";
      title = call?.is_intro ? "Знакомство перенесено" : "Созвон перенесён";
      sub = call ? `Новое время: ${when}. Перенёс ${byLabel(card.by)}` : null;
      if (live) {
        tone = "live";
        actions = joinBtn;
      }
      break;
    case "cancelled":
      icon = <CalendarX2 size={20} strokeWidth={1.8} />;
      iconTone = "coral";
      tone = "muted";
      title = call?.is_intro ? "Знакомство отменено" : "Созвон отменён";
      sub = call ? (
        <>
          <span className={s.cardStrike}>{when}</span>. Отменил {byLabel(card.by)}
        </>
      ) : null;
      break;
    case "started":
      icon = <PhoneCall size={20} strokeWidth={1.8} />;
      iconTone = "mint";
      title = call?.is_intro ? (live ? "Знакомство идёт" : "Знакомство началось") : live ? "Созвон идёт" : "Созвон начался";
      sub = call ? when : null;
      if (live) {
        tone = "live";
        actions = joinBtn;
      }
      break;
    case "ended":
      icon = <CircleCheckBig size={20} strokeWidth={1.8} />;
      iconTone = "mint";
      title = call?.is_intro ? "Знакомство завершено" : "Созвон завершён";
      sub = card.minutes ? `Длился ${card.minutes} мин` : call ? when : null;
      // G2: клиенту — приглашение оставить отзыв (модалка сама проверит, что созвон засчитан)
      if (role === "client" && reviewFor) {
        actions = (
          <Button variant="soft" size="sm" icon={<PenLine size={16} strokeWidth={1.8} />} onClick={() => setReviewing(true)}>
            Оставить отзыв
          </Button>
        );
      }
      break;
    case "proposed": {
      const p = card.proposal;
      icon = <Sparkles size={20} strokeWidth={1.8} />;
      iconTone = "sun";
      title = role === "specialist" ? "Вы предложили время" : "Специалист предлагает созвон";
      if (!p) {
        sub = "Предложение удалено";
        tone = "muted";
        break;
      }
      sub = `${weekdayDay(p.scheduled_at)}, ${range(p.scheduled_at, p.duration_minutes)}, ${rub(p.price_rub)}`;
      if (p.status !== "pending") {
        badge = <Badge tone={p.status === "accepted" ? "success" : "neutral"}>{PROPOSAL_STATUS[p.status]}</Badge>;
        if (p.status !== "accepted") tone = "muted";
      } else if (ctx && role === "client") {
        actions = (
          <>
            <Button variant="primary" size="sm" loading={ctx.busy === p.id} onClick={() => ctx.accept(p)}>
              Принять и оплатить
            </Button>
            <Button variant="ghost" size="sm" onClick={() => ctx.openBook()}>
              Другое время
            </Button>
            <Button variant="ghost" size="sm" disabled={ctx.busy === p.id} onClick={() => ctx.closeProposal(p)}>
              Отказаться
            </Button>
          </>
        );
      } else if (ctx && role === "specialist") {
        badge = <Badge tone="warning">Ждёт ответа</Badge>;
        actions = (
          <Button variant="ghost" size="sm" disabled={ctx.busy === p.id} onClick={() => ctx.closeProposal(p)}>
            Отозвать
          </Button>
        );
      }
      break;
    }
  }

  return (
    <div className={s.cardRow}>
      <div className={s.card} data-tone={tone}>
        <div className={s.cardTop}>
          <span className={s.cardIcon} data-tone={iconTone} aria-hidden>
            {icon}
          </span>
          <div className={s.cardText}>
            <div className={s.cardTitle}>{title}</div>
            {sub && <div className={s.cardSub}>{sub}</div>}
          </div>
          {badge ?? <span className={s.cardTime}>{at}</span>}
        </div>
        {actions && <div className={s.cardActions}>{actions}</div>}
      </div>
      {reviewFor && reviewing && (
        <ReviewModal open psychologistId={reviewFor} name={ctx?.detail?.counterpart.name} onClose={() => setReviewing(false)} />
      )}
    </div>
  );
}
