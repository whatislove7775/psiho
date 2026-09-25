/**
 * aprosop illustration kit: shared palette, <defs>, and drawing primitives.
 *
 * Style: flat friendly shapes with soft gradients, peach cheeks, dot or closed
 * "happy" eyes, subtle crayon grain (a hatched pattern overlay). Colours come
 * from the logo (blue → violet tile, yellow sparkle, peach cheeks) plus the
 * secondary accents (straw yellow, coral, cyan, lilac, mint).
 *
 * Every illustration renders its own <defs> with ids prefixed by useId(), so
 * several copies on one page (or a copy inside display:none) never collide.
 */
import { useId, type CSSProperties, type ReactNode } from "react";
import s from "./illustrations.module.css";

export type U = ((key: string) => string) & { id: (key: string) => string };

export const INK = "#1A2350";

// Gradient stops: [from, to]. Kept as plain constants: this is artwork, it looks
// the same in both themes. Theme-aware pieces (blobs, ground) use CSS classes.
const GRADS: Record<string, [string, string]> = {
  brand: ["#7AA5FF", "#6A4FE8"],
  blue: ["#8DB5FF", "#3A6DF0"],
  yellow: ["#FFE89A", "#F6BF3F"],
  coral: ["#FFB199", "#F0705B"],
  cyan: ["#A6F1F4", "#3FC3D8"],
  lilac: ["#E2D8FF", "#A68CFF"],
  mint: ["#C4F3E3", "#55C9A6"],
  peach: ["#FFD9C2", "#FFA784"],
  white: ["#FFFFFF", "#E7EBFA"],
  skinA: ["#FFE3CC", "#F3BB93"],
  skinB: ["#F4C29A", "#D48D5E"],
  skinC: ["#C98B60", "#945B38"],
  skinD: ["#9A6446", "#65392A"],
  hairDark: ["#4A3858", "#221A2E"],
  hairBrown: ["#9A5E3A", "#5E3421"],
  hairCoral: ["#FF9B80", "#E0573F"],
  hairBlond: ["#FFE3A0", "#E9B45C"],
  wood: ["#E7B17E", "#B97948"],
  night: ["#5B6CFF", "#3A2F9E"],
  leaf: ["#A6E6A0", "#3FAE7A"],
};

export type Skin = "skinA" | "skinB" | "skinC" | "skinD";
export type HairColor = "hairDark" | "hairBrown" | "hairCoral" | "hairBlond";
export type Tone = "brand" | "blue" | "yellow" | "coral" | "cyan" | "lilac" | "mint" | "peach" | "white";

/** Darker "crayon" stroke colour to pair with each fill. */
export const SHADE: Record<string, string> = {
  brand: "#4B3BC4",
  blue: "#2A55C8",
  yellow: "#D99A22",
  coral: "#D2503F",
  cyan: "#2AA3BA",
  lilac: "#7E63E6",
  mint: "#35A386",
  peach: "#E98A66",
  white: "#C7CEEA",
  skinA: "#E3A27A",
  skinB: "#B8744A",
  skinC: "#7A4628",
  skinD: "#4E2A1D",
  hairDark: "#6D5885",
  hairBrown: "#C07F55",
  hairCoral: "#FFC2AE",
  hairBlond: "#C98E3A",
  wood: "#9C6034",
  leaf: "#2F8E62",
};

function Defs({ p }: { p: string }) {
  return (
    <defs>
      {Object.entries(GRADS).map(([k, [a, b]]) => (
        <linearGradient key={k} id={`${p}${k}`} x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0" stopColor={a} />
          <stop offset="1" stopColor={b} />
        </linearGradient>
      ))}
      <linearGradient id={`${p}logo`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#7AA5FF" />
        <stop offset=".55" stopColor="#3A6DF0" />
        <stop offset="1" stopColor="#6A4FE8" />
      </linearGradient>
      <radialGradient id={`${p}glow`} cx=".5" cy=".5" r=".5">
        <stop offset="0" stopColor="#FFE17C" stopOpacity=".55" />
        <stop offset="1" stopColor="#FFE17C" stopOpacity="0" />
      </radialGradient>
      <radialGradient id={`${p}glowBlue`} cx=".5" cy=".5" r=".5">
        <stop offset="0" stopColor="#7AA5FF" stopOpacity=".45" />
        <stop offset="1" stopColor="#7AA5FF" stopOpacity="0" />
      </radialGradient>
      {/* Crayon grain: short, slightly scattered strokes, laid over a fill. */}
      <pattern id={`${p}grain`} width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(32)">
        <path d="M1 2.2h3.6M5.4 6.6h2.8M.6 7.4h1.6" stroke="#fff" strokeWidth="1.05" strokeLinecap="round" opacity=".16" />
        <path d="M4.6 3.9h2" stroke="#000" strokeWidth=".9" strokeLinecap="round" opacity=".07" />
      </pattern>
    </defs>
  );
}

export function Svg({
  viewBox,
  title,
  className,
  style,
  children,
}: {
  viewBox: string;
  title?: string;
  className?: string;
  style?: CSSProperties;
  children: (u: U) => ReactNode;
}) {
  const p = `il${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const u = ((k: string) => `url(#${p}${k})`) as U;
  u.id = (k: string) => `${p}${k}`;
  return (
    <svg
      viewBox={viewBox}
      className={`${s.root}${className ? ` ${className}` : ""}`}
      style={style}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <Defs p={p} />
      {children(u)}
    </svg>
  );
}

/* ── Primitives ─────────────────────────────────────────────────────────── */

/** Fill + crayon grain overlay for any path. */
export function Tex({ d, fill, u, grain = true, ...rest }: { d: string; fill: string; u: U; grain?: boolean } & React.SVGProps<SVGPathElement>) {
  return (
    <>
      <path d={d} fill={fill} {...rest} />
      {grain && <path d={d} fill={u("grain")} {...rest} />}
    </>
  );
}

/** A four-point sparkle centred at x,y. */
export function Spark({ x, y, r = 8, fill = "#FFD95A", opacity }: { x: number; y: number; r?: number; fill?: string; opacity?: number }) {
  const k = r * 0.2;
  return (
    <path
      d={`M${x} ${y - r}Q${x + k} ${y - k} ${x + r} ${y}Q${x + k} ${y + k} ${x} ${y + r}Q${x - k} ${y + k} ${x - r} ${y}Q${x - k} ${y - k} ${x} ${y - r}Z`}
      fill={fill}
      opacity={opacity}
    />
  );
}

/** Theme-aware soft blob behind a scene. */
export function Blob({ d, tone = "a" }: { d: string; tone?: "a" | "b" | "c" }) {
  return <path d={d} className={tone === "a" ? s.blob : tone === "b" ? s.blob2 : s.blob3} />;
}

export function Ground({ cx, cy, rx, ry = 7 }: { cx: number; cy: number; rx: number; ry?: number }) {
  return <ellipse cx={cx} cy={cy} rx={rx} ry={ry} className={s.ground} />;
}

export function Dot({ x, y, r = 3, cls = "dot" }: { x: number; y: number; r?: number; cls?: "dot" | "dotAlt" }) {
  return <circle cx={x} cy={y} r={r} className={s[cls]} />;
}

/** Rounded speech bubble with a tail at the bottom-left or bottom-right. */
export function bubblePath(x: number, y: number, w: number, h: number, tail: "bl" | "br" | "none" = "bl", r = 14) {
  const R = x + w;
  const b = y + h;
  let bottom = "";
  if (tail === "br") bottom = `L${R - r - 2} ${b}L${R - 4} ${b + 11}L${R - r - 18} ${b}`;
  if (tail === "bl") bottom = `L${x + r + 18} ${b}L${x + 4} ${b + 11}L${x + r + 2} ${b}`;
  return `M${x + r} ${y}L${R - r} ${y}Q${R} ${y} ${R} ${y + r}L${R} ${b - r}Q${R} ${b} ${R - r} ${b}${bottom}L${x + r} ${b}Q${x} ${b} ${x} ${b - r}L${x} ${y + r}Q${x} ${y} ${x + r} ${y}Z`;
}

/** The logo's speech-bubble face (white bubble, closed happy eyes, peach cheeks). 48×48 box at x,y scaled by s. */
export function LogoFace({ x, y, s: k = 1, eyes = "happy" }: { x: number; y: number; s?: number; eyes?: "happy" | "dot" | "sleep" }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${k})`}>
      <path
        d="M24 9.5c8.8 0 15.5 6 15.5 13.8S32.8 37 24 37c-1.6 0-3.1-.2-4.6-.6l-6.2 4.1c-.8.5-1.7-.3-1.4-1.1l1.8-5.3C10.5 31.8 8.5 27.8 8.5 23.3 8.5 15.5 15.2 9.5 24 9.5Z"
        fill="#fff"
      />
      <circle cx="15.4" cy="26.6" r="2.7" fill="#FFB08A" opacity=".85" />
      <circle cx="32.6" cy="26.6" r="2.7" fill="#FFB08A" opacity=".85" />
      {eyes === "happy" && (
        <path d="M16.6 21.8c1.2-1.9 3.6-1.9 4.8 0M26.6 21.8c1.2-1.9 3.6-1.9 4.8 0" stroke={INK} strokeWidth={2.2} strokeLinecap="round" fill="none" />
      )}
      {eyes === "sleep" && (
        <path d="M16.6 21.2c1.2 1.6 3.6 1.6 4.8 0M26.6 21.2c1.2 1.6 3.6 1.6 4.8 0" stroke={INK} strokeWidth={2.2} strokeLinecap="round" fill="none" />
      )}
      {eyes === "dot" && (
        <>
          <ellipse cx="19" cy="21.4" rx="1.9" ry="2.3" fill={INK} />
          <ellipse cx="29" cy="21.4" rx="1.9" ry="2.3" fill={INK} />
        </>
      )}
      <path d="M20.2 27.2c2.2 2.3 5.4 2.3 7.6 0" stroke={INK} strokeWidth={2.2} strokeLinecap="round" fill="none" />
    </g>
  );
}

/** Simple face features centred at 0,0 (for objects with faces: sun, moon, shield…). */
export function Face({
  x,
  y,
  k = 1,
  eyes = "happy",
  mouth = "smile",
  cheeks = true,
  look = 0,
}: {
  x: number;
  y: number;
  k?: number;
  eyes?: "happy" | "dot" | "sleep";
  mouth?: "smile" | "open" | "calm" | "o";
  cheeks?: boolean;
  look?: number;
}) {
  const w = 2.1;
  return (
    <g transform={`translate(${x} ${y}) scale(${k})`}>
      {cheeks && (
        <>
          <ellipse cx={-11} cy={6} rx={4.2} ry={2.8} fill="#FF8F73" opacity=".5" />
          <ellipse cx={11} cy={6} rx={4.2} ry={2.8} fill="#FF8F73" opacity=".5" />
        </>
      )}
      {eyes === "dot" && (
        <>
          <ellipse cx={-7 + look} cy={-2} rx={2.1} ry={2.6} fill={INK} />
          <ellipse cx={7 + look} cy={-2} rx={2.1} ry={2.6} fill={INK} />
          <circle cx={-6.3 + look} cy={-2.9} r={0.7} fill="#fff" />
          <circle cx={7.7 + look} cy={-2.9} r={0.7} fill="#fff" />
        </>
      )}
      {eyes === "happy" && (
        <path d="M-10 -1c1.4-2.6 4.6-2.6 6 0M4 -1c1.4-2.6 4.6-2.6 6 0" stroke={INK} strokeWidth={w} strokeLinecap="round" fill="none" />
      )}
      {eyes === "sleep" && (
        <path d="M-10 -2.2c1.4 2.2 4.6 2.2 6 0M4 -2.2c1.4 2.2 4.6 2.2 6 0" stroke={INK} strokeWidth={w} strokeLinecap="round" fill="none" />
      )}
      {mouth === "smile" && <path d="M-4 4.5c2 2.6 6 2.6 8 0" stroke={INK} strokeWidth={w} strokeLinecap="round" fill="none" />}
      {mouth === "calm" && <path d="M-2.6 5.4c1.6 1.1 3.6 1.1 5.2 0" stroke={INK} strokeWidth={w} strokeLinecap="round" fill="none" />}
      {mouth === "o" && <ellipse cx={0} cy={6} rx={2} ry={2.4} fill={INK} />}
      {mouth === "open" && (
        <>
          <path d="M-5 4c1.5 5.6 8.5 5.6 10 0Z" fill="#7A2E3A" />
          <path d="M-2.4 7.6c1.4-1.2 3.4-1.2 4.8 0c-1.4 1-3.4 1-4.8 0Z" fill="#FF8C8C" />
        </>
      )}
    </g>
  );
}

/* ── Person ─────────────────────────────────────────────────────────────── */

export type Hair = "short" | "bob" | "curly" | "bun" | "long" | "buzz" | "none";

export interface PersonProps {
  u: U;
  x: number;
  y: number;
  k?: number;
  skin?: Skin;
  hair?: Hair;
  hairColor?: HairColor;
  top?: Tone;
  eyes?: "dot" | "happy" | "sleep";
  mouth?: "smile" | "open" | "calm";
  look?: number;
  hat?: boolean;
  headphones?: boolean;
  glasses?: boolean;
  wave?: "left" | "right";
  /** Hold the logo bubble in front of the face: the avatar idea. */
  mask?: boolean;
  /** Draw the bust (neck + shoulders). */
  body?: boolean;
  flip?: boolean;
}

function hairBack(h: Hair, fill: string) {
  if (h === "long")
    return <path d="M-27 -2C-30 -26 -14 -33 0 -33C14 -33 30 -26 27 -2L29 44C18 50 -18 50 -29 44Z" fill={fill} />;
  if (h === "bob") return <path d="M-28 16C-32 -12 -18 -32 0 -32C18 -32 32 -12 28 16C22 22 -22 22 -28 16Z" fill={fill} />;
  if (h === "bun") return <circle cx={2} cy={-33} r={11} fill={fill} />;
  return null;
}

function hairFront(h: Hair, fill: string, shade: string, u: U) {
  switch (h) {
    case "short": {
      const d = "M-24.5 3C-27 -19 -12 -31 3 -30C18 -29 28 -18 24.5 3C22 -6 18 -11 11 -13C4 -7 -9 -6 -17 -11C-20 -7 -22.5 -3 -24.5 3Z";
      return (
        <>
          <Tex d={d} fill={fill} u={u} />
          <path d="M-8 -22c5-3 12-3 17 1" stroke={shade} strokeWidth="1.6" strokeLinecap="round" fill="none" opacity=".6" />
        </>
      );
    }
    case "buzz": {
      const d = "M-23.5 -2C-24 -20 -12 -28 0 -28C12 -28 24 -20 23.5 -2C20 -12 12 -17 0 -17C-12 -17 -20 -12 -23.5 -2Z";
      return <Tex d={d} fill={fill} u={u} />;
    }
    case "bob":
    case "long": {
      const d = "M-25 6C-27 -18 -12 -30 1 -30C16 -30 27 -18 25 6C23 -4 19 -9 13 -11C6 -5 -6 -6 -10 -16C-14 -8 -19 -3 -25 6Z";
      return (
        <>
          <Tex d={d} fill={fill} u={u} />
          <path d="M-4 -24c6-2 12 0 16 5" stroke={shade} strokeWidth="1.6" strokeLinecap="round" fill="none" opacity=".55" />
        </>
      );
    }
    case "bun": {
      const d = "M-24.5 4C-26 -18 -12 -29 1 -29C15 -29 27 -18 24.5 4C22 -6 16 -12 6 -14C-4 -12 -14 -8 -24.5 4Z";
      return (
        <>
          <Tex d={d} fill={fill} u={u} />
          <path d="M-5 -34c3-3 9-3 12 1" stroke={shade} strokeWidth="1.5" strokeLinecap="round" fill="none" opacity=".55" />
        </>
      );
    }
    case "curly": {
      // Scalloped curls around the crown, with the reference's swirl strokes.
      const curls: [number, number, number][] = [
        [-24, 2, 7.5], [-25, -9, 8.5], [-19, -20, 9], [-8, -27, 9.5], [4, -28, 9.5], [15, -23, 9], [23, -13, 8.5], [25, -2, 7.5],
        [-12, -14, 9], [2, -16, 9], [14, -12, 8],
      ];
      const swirls: [number, number][] = [[-19, -19], [-5, -26], [9, -25], [21, -12], [-22, -5], [2, -15]];
      return (
        <>
          <g fill={fill}>
            {curls.map(([cx, cy, r], i) => (
              <circle key={i} cx={cx} cy={cy} r={r} />
            ))}
          </g>
          <g fill={u("grain")}>
            {curls.map(([cx, cy, r], i) => (
              <circle key={i} cx={cx} cy={cy} r={r} />
            ))}
          </g>
          <g stroke={shade} strokeWidth="1.5" strokeLinecap="round" fill="none" opacity=".75">
            {swirls.map(([cx, cy], i) => (
              <path key={i} d={`M${cx - 3} ${cy + 1}a3 3 0 1 1 3 3a1.6 1.6 0 0 1-1.6-1.6`} />
            ))}
          </g>
        </>
      );
    }
    default:
      return null;
  }
}

export function Person({
  u,
  x,
  y,
  k = 1,
  skin = "skinA",
  hair = "short",
  hairColor = "hairDark",
  top = "brand",
  eyes = "dot",
  mouth = "smile",
  look = 0,
  hat,
  headphones,
  glasses,
  wave,
  mask,
  body = true,
  flip,
}: PersonProps) {
  const sk = u(skin);
  const hc = u(hairColor);
  const hs = SHADE[hairColor];
  const torso = "M-40 90C-40 58 -27 40 0 40C27 40 40 58 40 90Z";
  const waveSide = wave === "left" ? -1 : 1;
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -k : k} ${k})`}>
      {body && (
        <>
          <path d="M-8 16h16v28h-16Z" fill={sk} />
          <path d="M-8 22h16v8c-5 3-11 3-16 0Z" fill={SHADE[skin]} opacity=".35" />
          <Tex d={torso} fill={u(top)} u={u} />
          <path d="M-11 40.5C-7 49 7 49 11 40.5Z" fill={sk} />
          <path d="M-22 56c-2 10-2 22-1 34M22 56c2 10 2 22 1 34" stroke={SHADE[top]} strokeWidth="1.6" strokeLinecap="round" fill="none" opacity=".45" />
          {wave && (
            <g transform={`scale(${waveSide} 1)`}>
              <path d="M30 60C40 44 44 30 44 16" stroke={u(top)} strokeWidth="13" strokeLinecap="round" fill="none" />
              <path d="M30 60C40 44 44 30 44 16" stroke={u("grain")} strokeWidth="13" strokeLinecap="round" fill="none" />
              <g transform="translate(45 7) rotate(12)">
                <rect x="-7.5" y="-9" width="15" height="17" rx="7" fill={sk} />
                <rect x="-8.5" y="-18" width="4.4" height="12" rx="2.2" fill={sk} />
                <rect x="-3.8" y="-20" width="4.4" height="13" rx="2.2" fill={sk} />
                <rect x="0.9" y="-19" width="4.4" height="12" rx="2.2" fill={sk} />
                <rect x="5.2" y="-15" width="4" height="10" rx="2" fill={sk} />
                <rect x="-13" y="-5" width="9" height="4.4" rx="2.2" transform="rotate(-35 -8 -3)" fill={sk} />
              </g>
              <path d="M58 -10c4 3 5 8 4 12M63 -16c6 5 8 12 6 19" stroke={INK} strokeWidth="1.8" strokeLinecap="round" fill="none" opacity=".35" />
            </g>
          )}
        </>
      )}
      {hairBack(hair, hc)}
      <ellipse cx={-23} cy={3} rx={4.6} ry={6} fill={sk} />
      <ellipse cx={23} cy={3} rx={4.6} ry={6} fill={sk} />
      <path d="M0 -25C14 -25 23 -14 23 0C23 15 13 25 0 25C-13 25 -23 15 -23 0C-23 -14 -14 -25 0 -25Z" fill={sk} />
      {!mask && (
        <>
          <ellipse cx={-12.5} cy={9} rx={4.6} ry={3} fill="#FF8F73" opacity=".45" />
          <ellipse cx={12.5} cy={9} rx={4.6} ry={3} fill="#FF8F73" opacity=".45" />
          {eyes === "dot" && (
            <>
              <ellipse cx={-8 + look} cy={1.5} rx={2.4} ry={2.9} fill={INK} />
              <ellipse cx={8 + look} cy={1.5} rx={2.4} ry={2.9} fill={INK} />
              <circle cx={-7.2 + look} cy={0.5} r={0.8} fill="#fff" />
              <circle cx={8.8 + look} cy={0.5} r={0.8} fill="#fff" />
            </>
          )}
          {eyes === "happy" && (
            <path d="M-11.5 2.5c1.6-3 5.4-3 7 0M4.5 2.5c1.6-3 5.4-3 7 0" stroke={INK} strokeWidth="2.1" strokeLinecap="round" fill="none" />
          )}
          {eyes === "sleep" && (
            <path d="M-11.5 1.2c1.6 2.4 5.4 2.4 7 0M4.5 1.2c1.6 2.4 5.4 2.4 7 0" stroke={INK} strokeWidth="2.1" strokeLinecap="round" fill="none" />
          )}
          <path d={`M${-1 + look / 2} 5.5q1.6 1.6 3 0`} stroke={SHADE[skin]} strokeWidth="1.6" strokeLinecap="round" fill="none" />
          {mouth === "smile" && <path d="M-5 11c2.6 3.2 7.4 3.2 10 0" stroke={INK} strokeWidth="2.1" strokeLinecap="round" fill="none" />}
          {mouth === "calm" && <path d="M-3.2 12.2c2 1.3 4.4 1.3 6.4 0" stroke={INK} strokeWidth="2.1" strokeLinecap="round" fill="none" />}
          {mouth === "open" && (
            <>
              <path d="M-6 10.5c1.8 7.2 10.2 7.2 12 0Z" fill="#7A2E3A" />
              <path d="M-3 15c1.8-1.5 4.2-1.5 6 0c-1.8 1.3-4.2 1.3-6 0Z" fill="#FF8C8C" />
            </>
          )}
          {glasses && (
            <g stroke={INK} strokeWidth="1.8" fill="rgba(255,255,255,.18)">
              <circle cx={-8.5} cy={1.5} r={6.4} />
              <circle cx={8.5} cy={1.5} r={6.4} />
              <path d="M-2.1 1h4.2" fill="none" />
            </g>
          )}
        </>
      )}
      {hairFront(hair, hc, hs, u)}
      {hat && (
        <g>
          <Tex d="M-19 -15C-21 -40 21 -42 21 -15Z" fill={u("yellow")} u={u} />
          <path d="M-19.8 -21C-8 -16.5 9 -16.5 20.6 -21L21 -15C9 -11 -8 -11 -19.4 -15Z" fill={u("coral")} />
          <Tex d="M-44 -12C-44 -21 -24 -24 0 -24C24 -24 44 -21 44 -12C44 -6 24 -4 0 -4C-24 -4 -44 -6 -44 -12Z" fill={u("yellow")} u={u} />
          <g stroke={SHADE.yellow} strokeWidth="1.4" strokeLinecap="round" fill="none" opacity=".7">
            <path d="M-36 -12c4 1.5 8 2 12 2.3M-16 -8.6c5 .4 10 .4 15 0M8 -9c5-.3 10-.8 14-1.6M28 -12c3-.6 6-1.4 8-2.2" />
            <path d="M-12 -33c3-2 7-3 11-3M4 -35.5c4 .3 7 1.4 10 3.4M-15 -26c3-.7 5-1 8-1.2" />
          </g>
        </g>
      )}
      {headphones && (
        <g>
          <path d="M-26 2C-28 -36 28 -36 26 2" stroke={u("lilac")} strokeWidth="5.5" strokeLinecap="round" fill="none" />
          <rect x={-33} y={-6} width={12} height={20} rx={6} fill={u("coral")} />
          <rect x={21} y={-6} width={12} height={20} rx={6} fill={u("coral")} />
          <rect x={-31} y={-3} width={4} height={14} rx={2} fill="#fff" opacity=".35" />
        </g>
      )}
      {mask && (
        <g>
          {/* hand holding the bubble "avatar" at chin level */}
          <LogoFace x={-33} y={-38} s={1.45} eyes={eyes === "dot" ? "happy" : eyes} />
          {body && (
            <>
              <path d="M-31 66C-36 50 -34 36 -26 26" stroke={u(top)} strokeWidth="12" strokeLinecap="round" fill="none" />
              <path d="M-31 66C-36 50 -34 36 -26 26" stroke={u("grain")} strokeWidth="12" strokeLinecap="round" fill="none" />
              <Hand x={-24} y={20} u={u} skin={skin} rot={-20} />
            </>
          )}
        </g>
      )}
    </g>
  );
}

/** A hand + stick holding the mask; draw after Person with the same transform when needed. */
export function Hand({ x, y, k = 1, skin = "skinA", u, rot = 0 }: { x: number; y: number; k?: number; skin?: Skin; u: U; rot?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${k})`}>
      <rect x="-8" y="-8" width="16" height="16" rx="7.5" fill={u(skin)} />
      <rect x="-9.5" y="-12" width="9" height="5" rx="2.5" fill={u(skin)} />
      <path d="M-3 -2h7M-3 3h7" stroke={SHADE[skin]} strokeWidth="1.3" strokeLinecap="round" opacity=".6" />
    </g>
  );
}

/** Leafy potted plant. Base of the pot at x,y. */
export function Plant({ x, y, k = 1, u, pot = "coral" }: { x: number; y: number; k?: number; u: U; pot?: Tone }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${k})`}>
      <g fill={u("leaf")}>
        <path d="M0 -26C-4 -44 -18 -52 -26 -50C-24 -38 -14 -28 0 -26Z" />
        <path d="M0 -26C4 -48 18 -58 28 -56C26 -42 14 -30 0 -26Z" />
        <path d="M0 -24C-2 -54 4 -66 10 -70C14 -56 10 -38 0 -24Z" />
      </g>
      <g stroke={SHADE.leaf} strokeWidth="1.3" strokeLinecap="round" fill="none" opacity=".7">
        <path d="M0 -26C-8 -34 -16 -42 -22 -47M0 -26C8 -36 16 -46 24 -53M0 -26C2 -40 5 -54 9 -66" />
      </g>
      <Tex d="M-15 -26H15L11 0H-11Z" fill={u(pot)} u={u} />
      <path d="M-17 -30H17V-23H-17Z" fill={SHADE[pot]} opacity=".85" />
    </g>
  );
}
