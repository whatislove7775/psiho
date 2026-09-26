"use client";

/** Landing teaser for «Круги»: small anonymous support groups with a psychologist. */
import { Hand, Sparkles } from "lucide-react";
import { Badge, Button } from "@/ui";
import { AvatarThumb } from "@/components/avatar/AvatarThumb";
import { TOPIC_LABEL, TOPIC_TONE, type CircleTopic } from "@/lib/api/circles";
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
const TOPICS: CircleTopic[] = ["anxiety", "burnout", "breakup", "grief", "parenting"];

export function CirclesTeaser() {
  return (
    <section id="circles" className={`${s.wrap} ${s.section}`} aria-labelledby="circles-title">
      <div className={c.landing}>
        <div>
          <span className={c.landingEyebrow}>
            <Sparkles size={14} /> Новое: Круги
          </span>
          <h2 id="circles-title">Когда важно услышать: «у меня так же»</h2>
          <p>
            Круги — небольшие группы поддержки на 5–8 человек с психологом. Раз в неделю вы встречаетесь по одной теме. В каждом круге
            у вас новое имя вроде «Участник-Лиса», вместо лица аватар, а голос можно изменить. Можно просто слушать.
          </p>
          <div className={c.landingTopics}>
            {TOPICS.map((t) => (
              <Badge key={t} tone={TOPIC_TONE[t]}>
                {TOPIC_LABEL[t]}
              </Badge>
            ))}
          </div>
          <Button href="/app/circles" variant="primary" size="lg">
            Посмотреть круги
          </Button>
        </div>
        <div className={c.ringScene} aria-hidden>
          <div className={c.ringCenter}>
            Психолог
            <br />
            ведёт круг
          </div>
          {SEATS.map((seat, i) => {
            const a = (i / SEATS.length) * Math.PI * 2 - Math.PI / 2;
            return (
              <div
                key={seat.name}
                className={`${c.ringSeat} ${toneClass(seat.tone)} ${seat.speaking ? c.ringSpeaking : ""}`}
                style={{ left: `${50 + 38 * Math.cos(a)}%`, top: `${50 + 38 * Math.sin(a)}%` }}
              >
                <span>
                  <AvatarThumb config={null} seed={`landing-circle-${seat.name}`} size={88} />
                </span>
                <small>Участник-{seat.name}</small>
                {seat.hand && (
                  <span className={c.ringWave}>
                    <Hand size={14} />
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
