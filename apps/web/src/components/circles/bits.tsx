"use client";

/** Shared pieces of «Круги»: circle card, topic chips, seats meter, the anonymity banner, decorative ring. */
import Link from "next/link";
import type { ReactNode } from "react";
import { CalendarDays, Clock, Repeat } from "lucide-react";
import { Badge } from "@/ui";
import { AvatarThumb } from "@/components/avatar/AvatarThumb";
import { SpecialistPhoto } from "@/components/avatar/SpecialistPhoto";
import { dayShort, plural, time } from "@/lib/format";
import {
  STATUS_LABEL,
  STATUS_TONE,
  TOPIC_TONE,
  priceLine,
  rubK0,
  type CircleCard,
  type CircleTopic,
} from "@/lib/api/circles";
import s from "./circles.module.css";

export const cx = (...c: unknown[]) => c.filter((x) => typeof x === "string" && x).join(" ");

/** CSS class that sets --tone / --tone-soft / --tone-ink for a topic or tone name. */
export function toneClass(tone: string | undefined): string {
  return s[`t-${tone ?? "lilac"}`] ?? s["t-lilac"];
}
export const topicClass = (t: CircleTopic) => toneClass(TOPIC_TONE[t]);

export function meetingsLine(c: Pick<CircleCard, "format" | "meetings_count" | "meeting_minutes">): string {
  const dur = `${c.meeting_minutes} мин`;
  if (c.format === "single") return `Одна встреча, ${dur}`;
  return `${c.meetings_count} ${plural(c.meetings_count, "встреча", "встречи", "встреч")} раз в неделю, ${dur}`;
}

/** Decorative ring of «seats» (avatars as soft dots) for card tops. */
export function RingArt({ className, seats = 8, taken = 5 }: { className?: string; seats?: number; taken?: number }) {
  const r = 46;
  return (
    <svg viewBox="0 0 132 132" className={className} aria-hidden>
      <circle cx="66" cy="66" r={r} fill="none" stroke="var(--tone)" strokeOpacity=".35" strokeWidth="1.5" strokeDasharray="3 5" />
      {Array.from({ length: seats }, (_, i) => {
        const a = (i / seats) * Math.PI * 2 - Math.PI / 2;
        const x = 66 + r * Math.cos(a);
        const y = 66 + r * Math.sin(a);
        return <circle key={i} cx={x} cy={y} r={9} fill={i < taken ? "var(--tone)" : "var(--c-panel)"} stroke="var(--tone)" strokeWidth="1.5" opacity={i < taken ? 0.9 : 0.8} />;
      })}
      <circle cx="66" cy="66" r="14" fill="var(--tone)" opacity=".55" />
    </svg>
  );
}

export function SeatsMeter({ capacity, taken, compact }: { capacity: number; taken: number; compact?: boolean }) {
  const left = Math.max(0, capacity - taken);
  return (
    <div className={s.seats}>
      <span className={s.seatDots} aria-hidden>
        {Array.from({ length: capacity }, (_, i) => (
          <span key={i} className={cx(s.seat, i < taken && s.seatTaken)} />
        ))}
      </span>
      <span className={left === 0 ? s.seatsFull : undefined}>
        {left === 0
          ? "Мест нет, можно в лист ожидания"
          : compact
            ? `${left} ${plural(left, "место", "места", "мест")}`
            : `Свободно ${left} ${plural(left, "место", "места", "мест")} из ${capacity}`}
      </span>
    </div>
  );
}

export function CircleCardView({ c, href }: { c: CircleCard; href?: string }) {
  const when = c.next_meeting_at ?? c.first_meeting_at;
  return (
    <Link href={href ?? `/app/circles/${c.id}`} className={cx(s.card, topicClass(c.topic))}>
      <div className={s.cardTop}>
        <RingArt className={s.ringArt} seats={c.capacity} taken={c.seats_taken} />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Badge tone={TOPIC_TONE[c.topic]}>{c.topic_label}</Badge>
          {c.status !== "recruiting" && <Badge tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</Badge>}
        </div>
      </div>
      <div className={s.cardBody}>
        <h3 className={s.cardTitle}>{c.title}</h3>
        <p className={s.cardSummary}>{c.summary}</p>
        <div className={s.metaRow}>
          {when && (
            <span>
              <CalendarDays size={15} /> {c.status === "running" ? "Следующая" : "Старт"} {dayShort(when)}, {time(when)}
            </span>
          )}
          <span>
            {c.format === "single" ? <Clock size={15} /> : <Repeat size={15} />}
            {meetingsLine(c)}
          </span>
        </div>
        <SeatsMeter capacity={c.capacity} taken={c.seats_taken} compact />
        <div className={s.cardFoot}>
          <div className={s.hostMini}>
            <SpecialistPhoto url={c.host.photo_url} name={c.host.name} size={34} />
            <span style={{ minWidth: 0 }}>
              <b>{c.host.name}</b>
              <small>Ведущий, психолог</small>
            </span>
          </div>
          <div className={s.price}>
            {rubK0(c.price_kopecks)}
            <small>{c.billing === "series" && c.format !== "single" ? "за весь цикл" : "за встречу"}</small>
          </div>
        </div>
      </div>
    </Link>
  );
}

export function TopicChips({
  value,
  onChange,
  topics,
}: {
  value: string;
  onChange: (v: string) => void;
  topics: { id: CircleTopic; label: string; count: number }[];
}) {
  return (
    <div className={s.chips} role="group" aria-label="Темы кругов">
      <button type="button" className={s.chip} aria-pressed={value === ""} onClick={() => onChange("")}>
        Все темы
      </button>
      {topics.map((t) => (
        <button
          key={t.id}
          type="button"
          className={cx(s.chip, topicClass(t.id))}
          aria-pressed={value === t.id}
          onClick={() => onChange(value === t.id ? "" : t.id)}
        >
          <span className={s.chipDot} aria-hidden />
          {t.label}
          {t.count > 0 && <span className={s.chipCount}>{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** One quiet line on how anonymity works in a circle. */
export function AnonymityBanner({ title, children }: { title?: ReactNode; children?: ReactNode }) {
  return (
    <p className={s.anon}>
      <span className={s.anonFaces} aria-hidden>
        {["круг-лиса", "круг-сова", "круг-кит"].map((seed) => (
          <AvatarThumb key={seed} config={null} seed={seed} size={26} />
        ))}
      </span>
      <span>{children ?? title ?? "Новое имя в каждом круге, только аватар и маска голоса."}</span>
    </p>
  );
}

export { priceLine };
