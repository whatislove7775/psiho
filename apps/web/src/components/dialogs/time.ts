"use client";

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
    if (now > end) return "время вышло";
    return passed < 1 ? "начинается" : `идёт ${passed} мин`;
  }
  const totalMin = Math.floor(diff / 60000);
  if (totalMin < 10) {
    const s = Math.floor(diff / 1000);
    return `через ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }
  if (totalMin < 60) return `через ${totalMin} мин`;
  const h = Math.floor(totalMin / 60);
  if (h < 24) {
    const m = totalMin % 60;
    return `через ${h} ч${m ? ` ${m} мин` : ""}`;
  }
  const d = Math.round(h / 24);
  return `через ${d} ${plural(d, "день", "дня", "дней")}`;
}

/** «чт, 12 окт.» */
export function weekdayDay(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "short" });
}

export function hm(iso: string | Date): string {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export function range(startIso: string, minutes: number): string {
  return `${hm(startIso)}–${hm(new Date(new Date(startIso).getTime() + minutes * 60000))}`;
}

export const CALL_STATUS: Record<CallBrief["status"], { label: string; tone: "neutral" | "success" | "warning" | "danger" | "primary" }> = {
  draft: { label: "Черновик", tone: "neutral" },
  awaiting_payment: { label: "Ждёт оплаты", tone: "warning" },
  paid: { label: "Назначен", tone: "primary" },
  in_progress: { label: "Идёт сейчас", tone: "success" },
  completed: { label: "Состоялся", tone: "neutral" },
  cancelled: { label: "Отменён", tone: "danger" },
  refunded: { label: "Возврат", tone: "neutral" },
};

export function isLive(c: { status: string; can_join: boolean }): boolean {
  return c.can_join || c.status === "in_progress";
}

/** One-line text of a call card in the viewer's time zone (list previews). */
export function cardPreview(card: import("@/lib/api/chat").DialogCard): string {
  const call = card.call;
  if (card.type === "proposed") {
    const p = card.proposal;
    return p ? `Предложено время созвона: ${weekdayDay(p.scheduled_at)}, ${hm(p.scheduled_at)}` : "Предложение времени созвона";
  }
  if (!call) return "Созвон";
  const w = `${weekdayDay(call.scheduled_at)}, ${hm(call.scheduled_at)}`;
  if (call.is_intro) {
    // H1: «Знакомство, 15 минут»
    switch (card.type) {
      case "booked":
        return `Знакомство назначено: ${w}`;
      case "rescheduled":
        return `Знакомство перенесено на ${w}`;
      case "cancelled":
        return `Знакомство ${w} отменено`;
      case "started":
        return "Знакомство началось";
      case "ended":
        return "Знакомство завершено";
    }
  }
  switch (card.type) {
    case "booked":
      return `Созвон назначен: ${w}`;
    case "rescheduled":
      return `Созвон перенесён на ${w}`;
    case "cancelled":
      return `Созвон ${w} отменён`;
    case "started":
      return "Созвон начался";
    case "ended":
      return card.minutes ? `Созвон завершён, ${card.minutes} мин` : "Созвон завершён";
  }
  return "Созвон";
}
