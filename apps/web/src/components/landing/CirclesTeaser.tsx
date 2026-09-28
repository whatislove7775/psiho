"use client";

/**
 * Landing teaser for «Круги»: a ring of anonymous 3D heads around a psychologist (also a head, larger).
 *
 * The ring tells a tiny story on a loop: someone raises a hand, the psychologist turns to them, they talk
 * (mouth moves, a pulse ripples out), everyone else turns toward the speaker. Heads are still snapshots
 * of the Headz avatars (lib/avatar/headz/snapshot) in a few poses — front, turned left/right, smiling,
 * mouth open — so it stays cheap: no live WebGL loop on the landing.
 *  - fine pointer: the centre head follows the cursor and smiles when it's close; hovering a seat makes it
 *    smile, shows its name and everyone looks at it;
 *  - tap / click on a head: it smiles and a small reaction floats up (plain click — never blocks scrolling);
 *  - prefers-reduced-motion: static ring, no timers.
 * Nothing renders until the section is near the viewport (three.js is loaded lazily).
 */
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Hand, Heart, Sparkles, ThumbsUp } from "lucide-react";
import { normalizeAvatar, randomAvatar, type AvatarConfig } from "@/lib/avatar/schema";
import { toneClass } from "@/components/circles/bits";
import s from "@/components/landing/landing.module.css";
import t from "./circlesTeaser.module.css";

type Pose = "C" | "L" | "R" | "smile" | "talk";

const SEATS: { name: string; tone: string }[] = [
  { name: "Лиса", tone: "coral" },
  { name: "Сова", tone: "lilac" },
  { name: "Кит", tone: "cyan" },
  { name: "Ёж", tone: "sun" },
  { name: "Выдра", tone: "mint" },
  { name: "Панда", tone: "lilac" },
  { name: "Енот", tone: "cyan" },
  { name: "Белка", tone: "sun" },
  { name: "Бобр", tone: "coral" },
];

/** Who raises a hand next (not strictly around the circle, like a real conversation). */
const TALK = [2, 6, 0, 4, 7, 1, 5, 3, 8];
const REACTIONS = [Heart, ThumbsUp, Sparkles];

const SMILE = { mouthSmileLeft: 0.85, mouthSmileRight: 0.85, cheekSquintLeft: 0.35, cheekSquintRight: 0.35, eyeSquintLeft: 0.2, eyeSquintRight: 0.2 };
const POSES: Record<Pose, { yaw?: number; expression?: Record<string, number> }> = {
  C: {},
  L: { yaw: -0.42 },
  R: { yaw: 0.42 },
  smile: { expression: SMILE },
  talk: { expression: { jawOpen: 0.32, mouthSmileLeft: 0.25, mouthSmileRight: 0.25, mouthLowerDownLeft: 0.3, mouthLowerDownRight: 0.3 } },
};

/** Snapshots of one head in all poses: front first (fast first paint of the ring), the rest when idle. */
function usePoses(cfg: AvatarConfig, size: number, active: boolean) {
  const [urls, setUrls] = useState<Partial<Record<Pose, string>>>({});
  useEffect(() => {
    if (!active) return;
    let alive = true;
    import("@/lib/avatar/headz/snapshot")
      .then(async ({ renderAvatarSnapshot }) => {
        const one = async (p: Pose) => {
          const url = await renderAvatarSnapshot(cfg, { size, framing: "face", ...POSES[p] });
          if (alive) setUrls((u) => ({ ...u, [p]: url }));
        };
        await one("C");
        await new Promise((r) => setTimeout(r, 400));
        for (const p of ["L", "R", "talk", "smile"] as Pose[]) if (alive) await one(p);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [cfg, size, active]);
  return urls;
}

function Head({ cfg, size, pose, active, label }: { cfg: AvatarConfig; size: number; pose: Pose; active: boolean; label?: string }) {
  const urls = usePoses(cfg, size, active);
  const src = urls[pose] ?? urls.C;
  return (
    <span className={t.head}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={label ?? ""} draggable={false} />
      ) : (
        <span className={t.headStub} style={{ ["--skin" as string]: cfg.skin ?? "#e0b08a" }} />
      )}
    </span>
  );
}

/** Where a head at x (−1…1 across the ring) should look to face a target at tx. */
function turn(x: number, tx: number): Pose {
  const d = tx - x;
  return Math.abs(d) < 0.3 ? "C" : d > 0 ? "R" : "L";
}

export function CirclesTeaser() {
  const scene = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [still, setStill] = useState(true);
  const [fine, setFine] = useState(false);
  const [step, setStep] = useState(0); // index in TALK
  const [phase, setPhase] = useState<"hand" | "talk">("hand");
  const [mouth, setMouth] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const [cursor, setCursor] = useState<{ x: number; near: number } | null>(null);
  const [reacts, setReacts] = useState<{ id: number; seat: number; kind: number }[]>([]);
  const [smiling, setSmiling] = useState<Set<number>>(new Set());

  const cfgs = useMemo(() => SEATS.map((seat) => randomAvatar(`landing-circle-${seat.name}`)), []);
  const hostCfg = useMemo(
    () => normalizeAvatar({ version: 4, base: "woman-light", hair: "005", eyewear: "glasses-001", earrings: "earrings" }),
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

  // Start only when the ring is about to be seen.
  useEffect(() => {
    const el = scene.current;
    if (!el) return;
    setStill(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    setFine(window.matchMedia("(hover: hover) and (pointer: fine)").matches);
    if (!("IntersectionObserver" in window)) return setNear(true);
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && setNear(true), { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // The story loop: hand up (2.2 s) → talk (3.6 s) → next.
  useEffect(() => {
    if (!near || still) return;
    const id = window.setTimeout(
      () => {
        if (phase === "hand") setPhase("talk");
        else {
          setPhase("hand");
          setStep((x) => (x + 1) % TALK.length);
        }
      },
      phase === "hand" ? 2200 : 3600,
    );
    return () => window.clearTimeout(id);
  }, [near, still, phase, step]);

  // Mouth flaps while talking.
  useEffect(() => {
    if (!near || still) return;
    const id = window.setInterval(() => setMouth((m) => !m), 190);
    return () => window.clearInterval(id);
  }, [near, still]);

  // Fine pointer: the centre follows the cursor.
  useEffect(() => {
    const el = scene.current;
    if (!el || !fine || still) return;
    const zone = el.closest("section") ?? el;
    let raf = 0;
    const onMove = (e: Event) => {
      const pe = e as PointerEvent;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const dx = (pe.clientX - (r.left + r.width / 2)) / (r.width / 2);
        const dy = (pe.clientY - (r.top + r.height / 2)) / (r.height / 2);
        const dist = Math.hypot(dx, dy);
        el.style.setProperty("--px", Math.max(-1, Math.min(1, dx)).toFixed(3));
        el.style.setProperty("--py", Math.max(-1, Math.min(1, dy)).toFixed(3));
        setCursor({ x: dx, near: Math.max(0, 1 - dist / 1.4) });
      });
    };
    const onLeave = () => {
      cancelAnimationFrame(raf);
      el.style.setProperty("--px", "0");
      el.style.setProperty("--py", "0");
      setCursor(null);
    };
    zone.addEventListener("pointermove", onMove);
    zone.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      zone.removeEventListener("pointermove", onMove);
      zone.removeEventListener("pointerleave", onLeave);
    };
  }, [fine, still]);

  const current = TALK[step];
  const speaker = hover ?? (phase === "talk" ? current : null);
  const handUp = hover === null && phase === "hand" ? current : null;
  const focus = speaker ?? handUp; // where everyone looks

  const react = (i: number) => {
    const id = Date.now() + Math.random();
    setReacts((r) => [...r.slice(-5), { id, seat: i, kind: Math.floor(Math.random() * REACTIONS.length) }]);
    setSmiling((m) => new Set(m).add(i));
    window.setTimeout(() => {
      setReacts((r) => r.filter((x) => x.id !== id));
      setSmiling((m) => {
        const n = new Set(m);
        n.delete(i);
        return n;
      });
    }, 1400);
  };

  const hostPose: Pose = cursor
    ? cursor.near > 0.55
      ? "smile"
      : turn(0, cursor.x)
    : focus !== null
      ? turn(0, pos[focus].x)
      : "C";

  return (
    <section id="circles" className={`${s.wrap} ${s.section}`} aria-labelledby="circles-title">
      <div className={t.grid}>
        <div className={t.text}>
          <p className={s.kicker}>Круги</p>
          <h2 id="circles-title" className={s.sectionTitle}>
            Когда важно услышать «у&nbsp;меня так&nbsp;же»
          </h2>
          <p className={s.sectionSub}>Группы до&nbsp;12&nbsp;человек с&nbsp;психологом, раз в&nbsp;неделю. Тоже с&nbsp;аватаром. Можно просто слушать.</p>
          <Link href="/app/circles" className={s.more}>
            Посмотреть круги
            <ArrowRight size={16} strokeWidth={2} aria-hidden />
          </Link>
        </div>
        <div ref={scene} className={t.scene} data-fine={fine || undefined} data-still={still || undefined} aria-hidden>
          <span className={t.orbit} />
          <div className={t.center} data-listen={focus !== null || undefined} onClick={() => react(-1)}>
            <span className={t.centerDisc}>
              <Head cfg={hostCfg} size={320} pose={smiling.has(-1) ? "smile" : hostPose} active={near} />
            </span>
            <span className={t.centerName}>Психолог</span>
            {reacts
              .filter((r) => r.seat === -1)
              .map((r) => {
                const Icon = REACTIONS[r.kind];
                return (
                  <span key={r.id} className={t.react}>
                    <Icon size={16} fill="currentColor" />
                  </span>
                );
              })}
          </div>
          {SEATS.map((seat, i) => {
            const p = pos[i];
            const talking = speaker === i;
            const pose: Pose =
              smiling.has(i) || hover === i ? "smile" : talking ? (mouth ? "talk" : "C") : focus !== null ? turn(p.x, pos[focus].x) : "C";
            return (
              <div
                key={seat.name}
                data-seat={i}
                className={`${t.seat} ${toneClass(seat.tone)}`}
                data-talk={talking || undefined}
                data-above={p.y < -0.3 || undefined}
                style={{ left: `${50 + 40 * p.x}%`, top: `${50 + 40 * p.y}%`, ["--i" as string]: i }}
                onPointerEnter={fine ? () => setHover(i) : undefined}
                onPointerLeave={fine ? () => setHover((h) => (h === i ? null : h)) : undefined}
                onClick={() => react(i)}
              >
                <span className={t.pulse} />
                <span className={t.disc}>
                  <Head cfg={cfgs[i]} size={200} pose={pose} active={near} />
                </span>
                <span className={t.hand} data-up={handUp === i || undefined}>
                  <Hand size={14} />
                </span>
                <span className={t.name}>Участник-{seat.name}</span>
                {reacts
                  .filter((r) => r.seat === i)
                  .map((r) => {
                    const Icon = REACTIONS[r.kind];
                    return (
                      <span key={r.id} className={t.react}>
                        <Icon size={14} fill="currentColor" />
                      </span>
                    );
                  })}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
