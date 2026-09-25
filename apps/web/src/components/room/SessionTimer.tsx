"use client";

import { useEffect, useState } from "react";
import { Timer } from "lucide-react";

/** Remaining time of the booked session (duration comes from the booking, 50…180 min). */
export function SessionTimer({ start, minutes, className }: { start: string; minutes: number; className?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);
  const end = new Date(start).getTime() + minutes * 60000;
  const left = Math.ceil((end - now) / 60000);
  const text =
    left > 60
      ? `Осталось ${Math.floor(left / 60)} ч ${left % 60} мин`
      : left > 0
        ? `Осталось ${left} мин`
        : `Время вышло${left < 0 ? `, +${-left} мин` : ""}`;
  return (
    <span className={className} title={`Сессия на ${minutes} минут`} style={left <= 5 ? { color: "var(--p-butter)" } : undefined}>
      <Timer size={14} aria-hidden /> <span className="num">{text}</span>
    </span>
  );
}
