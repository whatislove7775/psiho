"use client";

/**
 * Landing teaser for «Круги»: a ring of anonymous live 3D heads around a psychologist (a bigger head).
 *
 * All seven heads are real-time HEADZ avatars drawn by one HeadzStage (ONE canvas / WebGL context,
 * lazy: nothing loads until the ring is near the viewport; paused off-screen / in a hidden tab;
 * 30 fps on phones). No discs behind the heads, no hands.
 *
 * The ring tells a tiny story on a loop: the next speaker catches everyone's attention (brows up,
 * a small nod), everyone — the psychologist too — turns to them, they talk (jaw + lips move in
 * syllables), then the next one. Every head breathes, blinks on its own rhythm and glances around.
 *  - fine pointer: the psychologist follows the cursor and smiles when it's close; hovering a seat
 *    makes it smile, shows its name and everyone looks at it;
 *  - tap / click on a head: it smiles and a small reaction floats up (plain click — never blocks scrolling);
 *  - prefers-reduced-motion: one still frame, no loop, no timers.
 */
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Heart, Sparkles, ThumbsUp } from "lucide-react";
import { normalizeAvatar, randomAvatar } from "@/lib/avatar/schema";
import type { HeadzRenderer } from "@/lib/avatar/headz/HeadzRenderer";
import { HeadStage, LiveHead } from "@/components/avatar/LiveHead";
import s from "@/components/landing/landing.module.css";
import t from "./circlesTeaser.module.css";
import { t as tt } from "@/lib/i18n";

const SEATS = ["Лиса", "Сова", "Кит", "Ёж", "Енот", "Белка"];

/** Who speaks next (not strictly around the circle, like a real conversation). */
const TALK = [2, 5, 0, 4, 1, 3];
const REACTIONS = [Heart, ThumbsUp, Sparkles];
const CUE_MS = 1600;
const TALK_MS = 4200;

/** Shared, mutable state the per-frame drivers read (no React re-render per frame). */
interface Ctl {
  speaker: number | null; // seat index, -1 = psychologist
  cue: number | null;
  hover: number | null;
  cursor: { x: number; y: number; near: number } | null;
  smiling: Map<number, number>; // seat → until (ms)
}

const clamp = (v: number, a = -1, b = 1) => Math.max(a, Math.min(b, v));

/** Talking mouth: syllables (~6/s) inside words, short pauses between words. */
function speech(time: number, seed: number) {
  const word =
    Math.sin(time * 1.7 + seed) + 0.6 * Math.sin(time * 2.9 + seed * 2);
  const env = word > -0.55 ? 1 : 0.15;
  const syl =
    0.5 + 0.5 * Math.sin(time * 12.5 + seed + Math.sin(time * 3.1) * 1.4);
  const open = env * (0.06 + 0.26 * syl * syl);
  const round = env * Math.max(0, Math.sin(time * 4.3 + seed * 3)) * 0.35;
  return { open, round };
}

export function CirclesTeaser() {
  const scene = useRef<HTMLDivElement>(null);
  const [still, setStill] = useState(false);
  const [fine, setFine] = useState(false);
  const [near, setNear] = useState(false);
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState<"cue" | "talk">("cue");
  const [hover, setHover] = useState<number | null>(null);
  const [reacts, setReacts] = useState<
    { id: number; seat: number; kind: number }[]
  >([]);
  const ctl = useRef<Ctl>({
    speaker: null,
    cue: null,
    hover: null,
    cursor: null,
    smiling: new Map(),
  });

  const cfgs = useMemo(
    () => SEATS.map((name) => randomAvatar(`landing-circle-${name}`)),
    [],
  );
  const hostCfg = useMemo(
    () =>
      normalizeAvatar({
        version: 4,
        base: "woman-light",
        hair: "005",
        eyewear: "glasses-001",
        earrings: "earrings",
      }),
    [],
  );
  const pos = useMemo(
    () =>
      SEATS.map((_, i) => {
        const a = (i / SEATS.length) * Math.PI * 2 - Math.PI / 2;
        return { x: Math.cos(a), y: Math.sin(a) };
      }),
    [],
  );

  useEffect(() => {
    setStill(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    setFine(window.matchMedia("(hover: hover) and (pointer: fine)").matches);
    const el = scene.current;
    if (!el || !("IntersectionObserver" in window)) return setNear(true);
    const io = new IntersectionObserver(
      (es) => setNear(es.some((e) => e.isIntersecting)),
      { rootMargin: "100px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // The story loop (only while the ring is on screen): cue → talk → next.
  useEffect(() => {
    if (!near || still) return;
    const id = window.setTimeout(
      () => {
        if (phase === "cue") setPhase("talk");
        else {
          setPhase("cue");
          setStep((x) => (x + 1) % TALK.length);
        }
      },
      phase === "cue" ? CUE_MS : TALK_MS,
    );
    return () => window.clearTimeout(id);
  }, [near, still, phase, step]);

  const current = TALK[step];
  const speaker = hover ?? (phase === "talk" ? current : null);
  const cue = hover === null && phase === "cue" ? current : null;
  ctl.current.speaker = hover === null && phase === "talk" ? current : null;
  ctl.current.cue = cue;
  ctl.current.hover = hover;

  // Fine pointer: the psychologist follows the cursor; the ring leans a little.
  useEffect(() => {
    const el = scene.current;
    if (!el || !fine || still) return;
    const zone = el.closest("section") ?? el;
    const onMove = (e: Event) => {
      const pe = e as PointerEvent;
      const r = el.getBoundingClientRect();
      const dx = (pe.clientX - (r.left + r.width / 2)) / (r.width / 2);
      const dy = (pe.clientY - (r.top + r.height / 2)) / (r.height / 2);
      ctl.current.cursor = {
        x: dx,
        y: dy,
        near: Math.max(0, 1 - Math.hypot(dx, dy) / 0.9),
      };
      el.style.setProperty("--px", clamp(dx).toFixed(3));
      el.style.setProperty("--py", clamp(dy).toFixed(3));
    };
    const onLeave = () => {
      ctl.current.cursor = null;
      el.style.setProperty("--px", "0");
      el.style.setProperty("--py", "0");
    };
    zone.addEventListener("pointermove", onMove);
    zone.addEventListener("pointerleave", onLeave);
    return () => {
      zone.removeEventListener("pointermove", onMove);
      zone.removeEventListener("pointerleave", onLeave);
    };
  }, [fine, still]);

  const react = (i: number) => {
    const id = Date.now() + Math.random();
    setReacts((r) => [
      ...r.slice(-5),
      { id, seat: i, kind: Math.floor(Math.random() * REACTIONS.length) },
    ]);
    ctl.current.smiling.set(i, performance.now() + 1600);
    window.setTimeout(
      () => setReacts((r) => r.filter((x) => x.id !== id)),
      1400,
    );
  };

  /** Per-frame driver of one head: where it looks and what its face does. */
  const drivers = useMemo(() => {
    const at = (i: number) => (i < 0 ? { x: 0, y: 0 } : pos[i]);
    return [-1, ...SEATS.map((_, i) => i)].map((i) => {
      const me = at(i);
      const seed = (i + 2) * 1.37;
      return (r: HeadzRenderer, time: number) => {
        const c = ctl.current;
        const now = performance.now();
        const smile = (c.smiling.get(i) ?? 0) > now || c.hover === i;
        const focus = c.hover ?? c.speaker ?? c.cue;
        let yaw = 0,
          pitch = 0;
        if (i < 0 && c.cursor && !smile) {
          yaw = clamp(c.cursor.x * 0.9);
          pitch = clamp(c.cursor.y * 0.7);
        } else if (focus !== null && focus !== i) {
          const f = at(focus);
          yaw = clamp((f.x - me.x) * 0.75);
          pitch = clamp((f.y - me.y) * 0.45);
        } else if (i >= 0 && focus === i) {
          // the speaker addresses the circle: faces the psychologist, looks around a bit
          yaw = clamp(-me.x * 0.55 + Math.sin(time * 0.6 + seed) * 0.25);
          pitch = clamp(-me.y * 0.3);
        } else {
          yaw = Math.sin(time * 0.23 + seed) * 0.3;
          pitch = Math.sin(time * 0.17 + seed * 2) * 0.12;
        }
        // listeners nod now and then
        const listening = focus !== null && focus !== i;
        if (listening)
          pitch += Math.max(0, Math.sin(time * 1.3 + seed)) ** 6 * 0.35;
        r.lookAt(yaw, pitch);

        const w: Record<string, number> = {
          mouthSmileLeft: 0.18,
          mouthSmileRight: 0.18,
        };
        if (c.speaker === i) {
          const sp = speech(time, seed);
          w.jawOpen = sp.open;
          w.mouthLowerDownLeft = w.mouthLowerDownRight = sp.open * 0.5;
          w.mouthFunnel = sp.round * 0.6;
          w.mouthPucker = sp.round * 0.3;
          w.mouthSmileLeft = w.mouthSmileRight = 0.25;
          w.browInnerUp = 0.15 + 0.2 * Math.max(0, Math.sin(time * 1.9 + seed));
        }
        if (c.cue === i) {
          w.browInnerUp = 0.55;
          w.browOuterUpLeft = w.browOuterUpRight = 0.4;
          w.mouthSmileLeft = w.mouthSmileRight = 0.45;
        }
        if (i < 0 && c.cursor && c.cursor.near > 0.3) {
          const k = Math.min(1, (c.cursor.near - 0.3) / 0.4);
          w.mouthSmileLeft = w.mouthSmileRight = 0.18 + 0.62 * k;
          w.cheekSquintLeft = w.cheekSquintRight = 0.35 * k;
        }
        if (smile) {
          w.mouthSmileLeft = w.mouthSmileRight = 0.85;
          w.cheekSquintLeft = w.cheekSquintRight = 0.4;
          w.eyeSquintLeft = w.eyeSquintRight = 0.25;
          w.jawOpen = 0;
        }
        r.setExpression(w);
      };
    });
  }, [pos]);

  const Reactions = ({ seat, size }: { seat: number; size: number }) => (
    <>
      {reacts
        .filter((r) => r.seat === seat)
        .map((r) => {
          const Icon = REACTIONS[r.kind];
          return (
            <span key={r.id} className={t.react}>
              <Icon size={size} fill="currentColor" />
            </span>
          );
        })}
    </>
  );

  return (
    <section
      id="circles"
      className={`${s.wrap} ${s.section}`}
      aria-labelledby="circles-title"
    >
      <div className={t.grid}>
        <div className={t.text}>
          <p className={s.kicker}>{tt("Круги")}</p>
          <h2 id="circles-title" className={s.sectionTitle}>
            {tt("Когда важно услышать «у\u00a0меня так\u00a0же»")}
          </h2>
          <p className={s.sectionSub}>
            {tt("Группы до\u00a012\u00a0человек с\u00a0психологом, раз в\u00a0неделю. Тоже с\u00a0аватаром. Можно просто слушать.")}
          </p>
          <Link href="/app/circles" className={s.more}>
            {tt("Посмотреть круги")}
            <ArrowRight size={16} strokeWidth={2} aria-hidden />
          </Link>
        </div>
        <div
          ref={scene}
          className={t.scene}
          data-fine={fine || undefined}
          aria-hidden
        >
          <span className={t.orbit} />
          <HeadStage
            still={still}
            className={t.stage}
            canvasClassName={t.canvas}
          >
            <div className={t.center} onClick={() => react(-1)}>
              <LiveHead
                cfg={hostCfg}
                onFrame={drivers[0]}
                bob={0.01}
                turnRate={4}
                seed={101}
                className={t.head}
              />
              <span className={t.centerName}>{tt("Психолог")}</span>
              <Reactions seat={-1} size={16} />
            </div>
            {SEATS.map((name, i) => {
              const p = pos[i];
              return (
                <div
                  key={name}
                  data-seat={i}
                  className={t.seat}
                  data-talk={speaker === i || undefined}
                  data-above={p.y < -0.3 || undefined}
                  style={{
                    left: `${50 + 40 * p.x}%`,
                    top: `${50 + 40 * p.y}%`,
                  }}
                  onPointerEnter={fine ? () => setHover(i) : undefined}
                  onPointerLeave={
                    fine
                      ? () => setHover((h) => (h === i ? null : h))
                      : undefined
                  }
                  onClick={() => react(i)}
                >
                  <LiveHead
                    cfg={cfgs[i]}
                    onFrame={drivers[i + 1]}
                    seed={i * 13.7 + 5}
                    className={t.head}
                  />
                  <span className={t.name}>{tt("Участник-{name}", { name: tt(name) })}</span>
                  <Reactions seat={i} size={14} />
                </div>
              );
            })}
          </HeadStage>
        </div>
      </div>
    </section>
  );
}
