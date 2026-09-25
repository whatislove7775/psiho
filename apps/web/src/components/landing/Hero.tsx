"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Shuffle } from "lucide-react";
import { AvatarThumb } from "@/components/avatar/AvatarThumb";
import { AvatarView, type AvatarViewHandle } from "@/components/avatar/AvatarView";
import { randomAvatar } from "@/lib/avatar/schema";
import { Button } from "@/ui";
import s from "./landing.module.css";

/** Sample identities: what a client looks like to a specialist. */
const PRESETS = [
  { seed: "aprosop-kit", alias: "тихий-кит-4821" },
  { seed: "aprosop-sova-7", alias: "смелая-сова-1937" },
  { seed: "aprosop-lis-2", alias: "рыжий-лис-5520" },
  { seed: "aprosop-ezh-11", alias: "сонный-ёж-0342" },
];

const EXTRA_ALIASES = [
  "добрый-лось-2710",
  "ясная-луна-6604",
  "тёплый-чай-1185",
  "лёгкий-ветер-9053",
  "мудрая-рысь-3378",
  "синий-клён-4410",
];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function Hero() {
  const [index, setIndex] = useState(0);
  const [extra, setExtra] = useState<{ seed: string; alias: string } | null>(null);
  const shuffles = useRef(0);
  const stageRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<AvatarViewHandle>(null);

  const current = extra ?? PRESETS[index];
  const config = useMemo(() => randomAvatar(current.seed), [current.seed]);

  // The head follows the pointer anywhere on the page, not only over the stage.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    let last: PointerEvent | null = null;
    const apply = () => {
      frame = 0;
      const el = stageRef.current;
      const r = viewRef.current?.renderer;
      if (!el || !r || !last) return;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height * 0.4;
      const nx = clamp((last.clientX - cx) / (window.innerWidth / 2), -1, 1);
      const ny = clamp((last.clientY - cy) / (window.innerHeight / 2), -1, 1);
      r.lookAt(nx * 0.95, ny * 0.7);
    };
    const onMove = (e: PointerEvent) => {
      last = e;
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const onLeave = () => viewRef.current?.renderer?.lookAt(0, 0);
    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  const shuffle = () => {
    shuffles.current += 1;
    setExtra({
      seed: `aprosop-shuffle-${Date.now()}`,
      alias: EXTRA_ALIASES[(shuffles.current - 1) % EXTRA_ALIASES.length],
    });
  };

  return (
    <section className={`${s.wrap} ${s.hero}`} aria-labelledby="hero-title">
      <div className={s.heroText}>
        <h1 id="hero-title" className={s.heroTitle}>
          Говорите свободно. Ваше лицо остаётся при вас.
        </h1>
        <p className={s.heroLead}>
          Диалоги и видеосозвоны с психологом, где вместо вас на экране 3D-аватар. Он повторяет вашу мимику, а специалист не видит
          ни лица, ни имени.
        </p>
        <div className={s.heroActions}>
          <Button href="/start" variant="primary" size="lg">
            Начать анонимно
          </Button>
          <Button href="/join" variant="secondary" size="lg">
            Я специалист
          </Button>
        </div>
        <p className={s.heroNote}>
          <span>
            Понадобится только пароль. Имя придумаем за вас, например <strong>тихий-кит-4821</strong>.
          </span>
        </p>
      </div>

      <figure className={s.heroFigure}>
        <div ref={stageRef} className={s.stage}>
          <div className={s.stageCanvas}>
            <AvatarView ref={viewRef} config={config} framing="portrait" interactive={false} />
          </div>
          <span className={s.nameTag} aria-live="polite">
            <span className={s.liveDot} aria-hidden />
            {current.alias}
          </span>
        </div>
        <figcaption className={s.picker}>
          <span className={s.pickerCaption}>Так вас видит специалист. Аватар вы соберёте сами после регистрации.</span>
          <span className={s.pickerRow} role="radiogroup" aria-label="Примеры аватаров">
            {PRESETS.map((p, i) => (
              <button
                key={p.seed}
                type="button"
                role="radio"
                aria-checked={!extra && index === i}
                aria-label={`Показать аватар ${p.alias}`}
                className={s.thumbBtn}
                onClick={() => {
                  setExtra(null);
                  setIndex(i);
                }}
              >
                <AvatarThumb config={null} seed={p.seed} size={44} />
              </button>
            ))}
            <Button
              variant="secondary"
              iconOnly
              aria-label="Показать случайный аватар"
              title="Случайный аватар"
              onClick={shuffle}
              icon={<Shuffle size={20} strokeWidth={1.8} />}
            />
          </span>
        </figcaption>
      </figure>
    </section>
  );
}
