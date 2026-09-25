/**
 * Spot icons: small (64×64) pictures in the illustration style for feature
 * explanations, steps and list items. Decorative by default.
 */
import { bubblePath, Face, INK, LogoFace, SHADE, Spark, Svg, Tex, type Tone, type U } from "./kit";

export type SpotName =
  | "key"
  | "mask"
  | "specialist"
  | "card"
  | "video"
  | "shield"
  | "direct"
  | "trash"
  | "calendar"
  | "chat"
  | "heart"
  | "clock"
  | "headphones"
  | "mic"
  | "lock"
  | "sparkle"
  | "leaf"
  | "book";

const BG: Record<SpotName, Tone> = {
  key: "yellow",
  mask: "brand",
  specialist: "mint",
  card: "coral",
  video: "cyan",
  shield: "lilac",
  direct: "cyan",
  trash: "coral",
  calendar: "lilac",
  chat: "cyan",
  heart: "coral",
  clock: "yellow",
  headphones: "lilac",
  mic: "mint",
  lock: "yellow",
  sparkle: "brand",
  leaf: "mint",
  book: "peach",
};

const SOFT: Partial<Record<Tone, string>> = {
  yellow: "var(--a-sun-soft, rgba(255, 219, 110, 0.16))",
  coral: "var(--a-coral-soft, rgba(255, 159, 133, 0.16))",
  peach: "var(--a-coral-soft, rgba(255, 159, 133, 0.16))",
  cyan: "var(--a-cyan-soft, rgba(111, 216, 242, 0.15))",
  lilac: "var(--a-lilac-soft, rgba(185, 166, 255, 0.16))",
  mint: "var(--a-mint-soft, rgba(143, 230, 201, 0.15))",
  brand: "var(--c-primary-soft, rgba(58, 109, 240, 0.16))",
};

function Heart({ x, y, k, fill }: { x: number; y: number; k: number; fill: string }) {
  return (
    <path
      transform={`translate(${x} ${y}) scale(${k})`}
      d="M0 8C-10 1 -14 -4 -14 -9C-14 -14 -10 -17 -6 -17C-3 -17 -1 -15 0 -13C1 -15 3 -17 6 -17C10 -17 14 -14 14 -9C14 -4 10 1 0 8Z"
      fill={fill}
    />
  );
}

function Draw({ name, u }: { name: SpotName; u: U }) {
  switch (name) {
    case "key":
      return (
        <g transform="rotate(-24 32 34)">
          <Tex d="M34 30H54C56 30 57 31 57 33V35C57 37 56 38 54 38H52V43C52 44 51 45 50 45H47C46 45 45 44 45 43V38H42V41C42 42 41 43 40 43H38C37 43 36 42 36 41V38H34Z" fill={u("yellow")} u={u} />
          <circle cx="22" cy="34" r="15" fill={u("yellow")} />
          <circle cx="22" cy="34" r="10" fill="#fff" />
          <g transform="rotate(24 22 34)">
            <Face x={22} y={34} k={0.5} eyes="happy" mouth="smile" cheeks={false} />
          </g>
        </g>
      );
    case "mask":
      return (
        <>
          <rect x="14" y="14" width="36" height="36" rx="11" fill={u("logo")} />
          <LogoFace x={14.5} y={14} s={0.74} />
          <Spark x={48} y={14} r={5} />
        </>
      );
    case "specialist":
      return (
        <>
          <path d="M14 56C14 44 21 38 32 38C43 38 50 44 50 56Z" fill={u("mint")} />
          <circle cx="32" cy="26" r="11" fill={u("skinA")} />
          <path d="M21 25C20 16 26 12 32 12C39 12 44 16 43 25C40 21 36 19 32 20C28 17 24 20 21 25Z" fill={u("hairBrown")} />
          <g stroke={INK} strokeWidth="1.4" fill="none">
            <circle cx="28" cy="27" r="3.4" />
            <circle cx="36" cy="27" r="3.4" />
          </g>
          <path d="M29.5 32c1.5 1.4 3.5 1.4 5 0" stroke={INK} strokeWidth="1.4" strokeLinecap="round" fill="none" />
          <circle cx="48" cy="44" r="8" fill={u("brand")} />
          <path d="M44.5 44l2.3 2.3 4.4-4.6" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </>
      );
    case "card":
      return (
        <>
          <g transform="rotate(-10 32 34)">
            <Tex d="M12 22C12 19 14 17 17 17H47C50 17 52 19 52 22V44C52 47 50 49 47 49H17C14 49 12 47 12 44Z" fill={u("logo")} u={u} />
            <rect x="12" y="23" width="40" height="6" fill={INK} opacity=".45" />
            <rect x="17" y="35" width="10" height="7" rx="2" fill={u("yellow")} />
            <path d="M33 41h13" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" opacity=".8" />
          </g>
          <Spark x={52} y={14} r={5} />
        </>
      );
    case "video":
      return (
        <>
          <Tex d="M10 24C10 21 12 19 15 19H40C43 19 45 21 45 24V42C45 45 43 47 40 47H15C12 47 10 45 10 42Z" fill={u("brand")} u={u} />
          <path d="M45 29L55 23V43L45 37Z" fill={u("cyan")} />
          <LogoFace x={13} y={18} s={0.6} />
        </>
      );
    case "shield":
      return (
        <>
          <Tex d="M32 10C38 14 45 15 51 15C51 34 46 47 32 55C18 47 13 34 13 15C19 15 26 14 32 10Z" fill={u("logo")} u={u} />
          <path d="M32 16C36 18.6 41 19.8 45 20C45 34 41 43 32 49C23 43 19 34 19 20C23 19.8 28 18.6 32 16Z" fill="#fff" />
          <Face x={32} y={32} k={0.55} eyes="happy" mouth="smile" />
        </>
      );
    case "direct":
      return (
        <>
          <path d="M18 34C26 22 38 22 46 34" stroke="#8B93C9" strokeWidth="2.4" strokeLinecap="round" strokeDasharray="0.5 5" fill="none" />
          <circle cx="15" cy="38" r="10" fill={u("cyan")} />
          <circle cx="49" cy="38" r="10" fill={u("lilac")} />
          <Face x={15} y={38} k={0.45} eyes="happy" mouth="smile" cheeks={false} />
          <Face x={49} y={38} k={0.45} eyes="happy" mouth="smile" cheeks={false} />
          <Heart x={32} y={24} k={0.34} fill={u("coral")} />
        </>
      );
    case "trash":
      return (
        <>
          <Tex d="M18 24H46L43 52C43 54 41 55 39 55H25C23 55 21 54 21 52Z" fill={u("coral")} u={u} />
          <rect x="14" y="18" width="36" height="7" rx="3.5" fill={SHADE.coral} />
          <rect x="27" y="13" width="10" height="6" rx="3" fill={SHADE.coral} />
          <path d="M27 32V47M37 32V47" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" opacity=".7" />
          <Spark x={51} y={36} r={6} />
        </>
      );
    case "calendar":
      return (
        <>
          <rect x="12" y="16" width="40" height="38" rx="9" fill="#fff" />
          <path d="M12 25C12 20 16 16 21 16H43C48 16 52 20 52 25V27H12Z" fill={u("logo")} />
          <rect x="20" y="11" width="4" height="10" rx="2" fill={INK} />
          <rect x="40" y="11" width="4" height="10" rx="2" fill={INK} />
          <circle cx="38" cy="41" r="7" fill={u("coral")} />
          <Heart x={38} y={41.5} k={0.24} fill="#fff" />
          <rect x="19" y="33" width="6" height="6" rx="2" fill="#DDE3F6" />
          <rect x="19" y="43" width="6" height="6" rx="2" fill="#DDE3F6" />
          <rect x="29" y="33" width="6" height="6" rx="2" fill="#DDE3F6" />
        </>
      );
    case "chat":
      return (
        <>
          <path d={bubblePath(8, 12, 36, 24, "bl", 10)} fill={u("cyan")} />
          <circle cx="18" cy="24" r="2.4" fill={INK} />
          <circle cx="26" cy="24" r="2.4" fill={INK} opacity=".6" />
          <circle cx="34" cy="24" r="2.4" fill={INK} opacity=".35" />
          <path d={bubblePath(24, 32, 32, 20, "br", 9)} fill={u("logo")} />
          <path d="M31 40h18M31 46h10" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
        </>
      );
    case "heart":
      return (
        <>
          <Heart x={32} y={38} k={1.5} fill={u("coral")} />
          <path d="M20 22c2-3 5-4 8-3" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" opacity=".6" fill="none" />
          <Spark x={51} y={15} r={5} />
        </>
      );
    case "clock":
      return (
        <>
          <circle cx="32" cy="34" r="20" fill="#fff" />
          <circle cx="32" cy="34" r="20" fill="none" stroke={u("yellow")} strokeWidth="5" />
          <path d="M32 24V34L39 38" stroke={INK} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <Spark x={52} y={14} r={5} fill="#8FE6F0" />
        </>
      );
    case "headphones":
      return (
        <>
          <path d="M14 38C12 16 52 16 50 38" stroke={u("lilac")} strokeWidth="5" strokeLinecap="round" fill="none" />
          <rect x="9" y="33" width="12" height="18" rx="6" fill={u("coral")} />
          <rect x="43" y="33" width="12" height="18" rx="6" fill={u("coral")} />
          <path d="M30 36v8M34 32v12" stroke={u("brand")} strokeWidth="3" strokeLinecap="round" />
        </>
      );
    case "mic":
      return (
        <>
          <Tex d="M25 16C25 12 28 10 32 10C36 10 39 12 39 16V32C39 36 36 38 32 38C28 38 25 36 25 32Z" fill={u("brand")} u={u} />
          <path d="M19 30C19 38 25 44 32 44C39 44 45 38 45 30M32 44V52M25 53H39" stroke="#8B93C9" strokeWidth="2.8" strokeLinecap="round" fill="none" />
          <path d="M50 22c3 3 3 9 0 12M54 18c5 5 5 15 0 20" stroke={u("cyan")} strokeWidth="2.6" strokeLinecap="round" fill="none" />
        </>
      );
    case "lock":
      return (
        <>
          <path d="M22 30V23C22 13 42 13 42 23V30" stroke="#9AA6CF" strokeWidth="5" fill="none" strokeLinecap="round" />
          <Tex d="M14 32C14 29 16 28 19 28H45C48 28 50 29 50 32V50C50 53 48 55 45 55H19C16 55 14 53 14 50Z" fill={u("yellow")} u={u} />
          <Face x={32} y={41} k={0.5} eyes="happy" mouth="smile" cheeks />
        </>
      );
    case "sparkle":
      return (
        <>
          <Spark x={28} y={34} r={17} />
          <Spark x={48} y={16} r={7} fill="#8FE6F0" />
          <Spark x={50} y={48} r={5} fill="#CBBEFF" />
        </>
      );
    case "leaf":
      return (
        <>
          <path d="M14 50C12 28 28 12 52 12C54 36 38 52 14 50Z" fill={u("leaf")} />
          <path d="M14 50C24 38 34 28 46 18" stroke={SHADE.leaf} strokeWidth="2.2" strokeLinecap="round" fill="none" />
          <path d="M24 40l-2-8M32 32l-1-9M30 34l8 1M22 42l8 1" stroke={SHADE.leaf} strokeWidth="1.6" strokeLinecap="round" opacity=".7" />
        </>
      );
    case "book":
      return (
        <>
          <Tex d="M10 18C18 15 26 16 32 20V52C26 48 18 47 10 50Z" fill={u("brand")} u={u} />
          <Tex d="M54 18C46 15 38 16 32 20V52C38 48 46 47 54 50Z" fill={u("lilac")} u={u} />
          <path d="M16 26c4-1 8-1 11 1M16 33c4-1 8-1 11 1M37 27c4-2 8-2 11-1M37 34c4-2 8-2 11-1" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity=".75" />
          <Spark x={52} y={12} r={5} />
        </>
      );
  }
}

export function Spot({ name, size = 56, title, className, bg = true }: { name: SpotName; size?: number; title?: string; className?: string; bg?: boolean }) {
  return (
    <Svg viewBox="0 0 64 64" title={title} className={className} style={{ width: size, height: size, flex: "none" }}>
      {(u) => (
        <>
          {bg && <circle cx="32" cy="32" r="31" style={{ fill: SOFT[BG[name]] }} />}
          <Draw name={name} u={u} />
        </>
      )}
    </Svg>
  );
}
