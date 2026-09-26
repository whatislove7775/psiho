"use client";

/** Landing teaser for «Круги»: small anonymous support groups with a psychologist. */
import Link from "next/link";
import { ArrowRight, Hand } from "lucide-react";
import { AvatarThumb } from "@/components/avatar/AvatarThumb";
import { toneClass } from "@/components/circles/bits";
import s from "@/components/landing/landing.module.css";
import c from "@/components/circles/circles.module.css";

const SEATS: { name: string; tone: string; speaking?: boolean; hand?: boolean }[] = [
  { name: "Лиса", tone: "coral", speaking: true },
  { name: "Сова", tone: "lilac" },
  { name: "Кит", tone: "cyan", hand: true },
  { name: "Ёж", tone: "sun" },
  { name: "Выдра", tone: "mint" },
  { name: "Панда", tone: "lilac" },
  { name: "Енот", tone: "cyan" },
];

export function CirclesTeaser() {
  return (
    <section id="circles" className={`${s.wrap} ${s.section}`} aria-labelledby="circles-title">
      <div className={s.circles}>
        <div className={s.circlesText}>
          <p className={s.kicker}>Круги</p>
          <h2 id="circles-title" className={s.sectionTitle}>
            Когда важно услышать «у&nbsp;меня так же»
          </h2>
          <p className={s.sectionSub}>Группы на 5–8 человек с психологом, раз в неделю. Тоже с аватаром. Можно просто слушать.</p>
          <Link href="/app/circles" className={s.more}>
            Посмотреть круги
            <ArrowRight size={16} strokeWidth={2} aria-hidden />
          </Link>
        </div>
        <div className={`${c.ringScene} ${s.ring}`} aria-hidden>
          <div className={c.ringCenter}>Психолог</div>
          {SEATS.map((seat, i) => {
            const a = (i / SEATS.length) * Math.PI * 2 - Math.PI / 2;
            return (
              <div
                key={seat.name}
                className={`${c.ringSeat} ${toneClass(seat.tone)} ${seat.speaking ? c.ringSpeaking : ""}`}
                style={{ left: `${50 + 38 * Math.cos(a)}%`, top: `${50 + 38 * Math.sin(a)}%` }}
              >
                <span>
                  <AvatarThumb config={null} seed={`landing-circle-${seat.name}`} size={64} />
                </span>
                {seat.hand && (
                  <span className={`${c.ringWave} ${s.ringHand}`}>
                    <Hand size={12} />
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
