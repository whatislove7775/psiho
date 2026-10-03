"use client";

import { t as tt, intlLocale } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { plural } from "@/lib/format";
import type { CallBrief } from "@/lib/api/chat";

/** Re-renders every `ms` (for countdowns and «можно входить»). */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** «через 2 ч 15 мин», «через 4:59», «идёт 12 мин» */
export function countdown(startIso: string, durationMin: number, now = Date.now()): string {
  const start = new Date(startIso).getTime();
  const diff = start - now;
  if (diff <= 0) {
    const passed = Math.floor((now - start) / 60000);
    const end = start + durationMin * 60000;
    if (now > end) return tt("время вышло");
    return passed < 1 ? tt("начинается") : tt(`идёт {passed} мин`, { passed });
  }
  const totalMin = Math.floor(diff / 60000);
  if (totalMin < 10) {
    const s = Math.floor(diff / 1000);
    return tt(`через {v}:{v2}`, { v: Math.floor(s / 60), v2: String(s % 60).padStart(2, "0") });
  }
  if (totalMin < 60) return tt(`через {totalMin} мин`, { totalMin });
  const h = Math.floor(totalMin / 60);
  if (h < 24) {
    const m = totalMin % 60;
    return tt(`через {h} ч{v}`, { h, v: m ? tt(` {m} мин`, { m }) : "" });
  }
  const d = Math.round(h / 24);
  return tt(`через {d} {plural}`, { d, plural: plural(d, "день", "дня", "дней") });
}

/** «чт, 12 окт.» */
export function weekdayDay(iso: string): string {
  return new Date(iso).toLocaleDateString(intlLocale(), { weekday: "short", day: "numeric", month: "short" });
}

export function hm(iso: string | Date): string {
  return new Date(iso).toLocaleTimeString(intlLocale(), { hour: "2-digit", minute: "2-digit" });
}

export function range(startIso: string, minutes: number): string {
  return `${hm(startIso)}–${hm(new Date(new Date(startIso).getTime() + minutes * 60000))}`;
}

export const CALL_STATUS: Record<CallBrief["status"], { label: string; tone: "neutral" | "success" | "warning" | "danger" | "primary" }> = {
  draft: { get label() { return tt("Черновик"); }, tone: "neutral" },
  awaiting_payment: { get label() { return tt("Ждёт оплаты"); }, tone: "warning" },
  paid: { get label() { return tt("Назначен"); }, tone: "primary" },
  in_progress: { get label() { return tt("Идёт сейчас"); }, tone: "success" },
  completed: { get label() { return tt("Состоялся"); }, tone: "neutral" },
  cancelled: { get label() { return tt("Отменён"); }, tone: "danger" },
  refunded: { get label() { return tt("Возврат"); }, tone: "neutral" },
};

export function isLive(c: { status: string; can_join: boolean }): boolean {
  return c.can_join || c.status === "in_progress";
}

/** One-line text of a call card in the viewer's time zone (list previews). */
export function cardPreview(card: import("@/lib/api/chat").DialogCard): string {
  const call = card.call;
  if (card.type === "proposed") {
    const p = card.proposal;
    return p ? tt(`Предложено время созвона: {weekdayDay}, {hm}`, { weekdayDay: weekdayDay(p.scheduled_at), hm: hm(p.scheduled_at) }) : tt("Предложение времени созвона");
  }
  if (!call) return tt("Созвон");
  const w = `${weekdayDay(call.scheduled_at)}, ${hm(call.scheduled_at)}`;
  if (call.is_intro) {
    // H1: «Знакомство, 15 минут»
    switch (card.type) {
      case "booked":
        return tt(`Знакомство назначено: {w}`, { w });
      case "rescheduled":
        return tt(`Знакомство перенесено на\u00a0{w}`, { w });
      case "cancelled":
        return tt(`Знакомство {w} отменено`, { w });
      case "started":
        return tt("Знакомство началось");
      case "ended":
        return tt("Знакомство завершено");
    }
  }
  switch (card.type) {
    case "booked":
      return tt(`Созвон назначен: {w}`, { w });
    case "rescheduled":
      return tt(`Созвон перенесён на\u00a0{w}`, { w });
    case "cancelled":
      return tt(`Созвон {w} отменён`, { w });
    case "started":
      return tt("Созвон начался");
    case "ended":
      return card.minutes ? tt(`Созвон завершён, {minutes} мин`, { minutes: card.minutes }) : tt("Созвон завершён");
  }
  return tt("Созвон");
}
