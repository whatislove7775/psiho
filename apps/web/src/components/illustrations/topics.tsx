/**
 * Small cover motifs for articles and practices, one per topic / practice kind.
 * Drawn to sit on the pastel cover tones (peach, butter, lime, mint, lilac, sky),
 * so they read well in both themes.
 */
import { bubblePath, Face, INK, LogoFace, SHADE, Spark, Svg, Tex, type U } from "./kit";

export type TopicKey =
  | "anxiety"
  | "mood"
  | "stress"
  | "sleep"
  | "relationships"
  | "self"
  | "loss"
  | "therapy"
  | "boundaries"
  | "loneliness"
  | "breathing"
  | "grounding"
  | "body"
  | "journaling"
  | "mindfulness";

function Heart({ x, y, k, fill }: { x: number; y: number; k: number; fill: string }) {
  return (
    <path
      transform={`translate(${x} ${y}) scale(${k})`}
      d="M0 8C-10 1 -14 -4 -14 -9C-14 -14 -10 -17 -6 -17C-3 -17 -1 -15 0 -13C1 -15 3 -17 6 -17C10 -17 14 -14 14 -9C14 -4 10 1 0 8Z"
      fill={fill}
    />
  );
}

const CLOUD = "M-26 8C-34 8 -36 -4 -27 -6C-27 -16 -14 -20 -8 -12C-4 -22 12 -22 14 -10C24 -12 30 -2 24 6C22 8 20 8 18 8Z";

function Motif({ t, u }: { t: TopicKey; u: U }) {
  switch (t) {
    case "anxiety":
      return (
        <>
          <path d="M18 62c10-8 22 6 32-2M22 74c12-6 20 4 30-2" stroke={INK} strokeWidth="2.4" strokeLinecap="round" fill="none" opacity=".35" />
          <g transform="translate(66 42) scale(1.25)">
            <path d={CLOUD} fill="#fff" />
          </g>
          <Face x={64} y={44} k={0.8} eyes="sleep" mouth="calm" />
          <path d="M96 64c6 0 8 6 3 8" stroke={INK} strokeWidth="2.4" strokeLinecap="round" fill="none" opacity=".35" />
          <Spark x={100} y={20} r={6} />
        </>
      );
    case "mood":
      return (
        <>
          <g stroke="#F6BF3F" strokeWidth="3.4" strokeLinecap="round">
            <path d="M48 8v6M22 20l4 4M74 20l-4 4M16 44h6" />
          </g>
          <Tex d="M48 22A20 20 0 1 1 47.9 22Z" fill={u("yellow")} u={u} />
          <Face x={48} y={42} k={0.75} eyes="happy" mouth="smile" />
          <g transform="translate(82 60) scale(1.05)">
            <path d={CLOUD} fill="#fff" />
          </g>
          <Spark x={104} y={26} r={5} fill="#fff" />
        </>
      );
    case "stress":
      return (
        <>
          <rect x="24" y="30" width="62" height="34" rx="9" fill="#fff" />
          <rect x="86" y="40" width="7" height="14" rx="3" fill="#fff" />
          <rect x="30" y="36" width="14" height="22" rx="4" fill={u("coral")} />
          <Face x={62} y={47} k={0.62} eyes="sleep" mouth="calm" cheeks />
          <path d="M100 14l-8 14h8l-6 12" stroke="#F6BF3F" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <path d="M18 76C16 66 22 60 30 60C30 68 26 74 18 76Z" fill={u("leaf")} />
        </>
      );
    case "sleep":
      return (
        <>
          <Tex d="M58 14A32 32 0 1 0 90 56A26 26 0 0 1 58 14Z" fill={u("yellow")} u={u} />
          <g transform="rotate(-20 52 56)">
            <Face x={50} y={54} k={0.72} eyes="sleep" mouth="calm" />
          </g>
          <Spark x={94} y={22} r={6} fill="#fff" />
          <Spark x={104} y={44} r={3.5} fill="#fff" />
          <g fill={u("brand")} style={{ fontFamily: "var(--font)", fontWeight: 800 }}>
            <text x="78" y="36" fontSize="12">
              z
            </text>
            <text x="88" y="26" fontSize="9">
              z
            </text>
          </g>
        </>
      );
    case "relationships":
      return (
        <>
          <path d={bubblePath(14, 16, 50, 36, "bl", 16)} fill={u("cyan")} />
          <path d={bubblePath(52, 32, 52, 36, "br", 16)} fill={u("coral")} />
          <Face x={38} y={34} k={0.62} eyes="happy" mouth="smile" cheeks={false} />
          <Heart x={78} y={52} k={0.62} fill="#fff" />
        </>
      );
    case "self":
      return (
        <>
          <Tex d="M58 12C74 12 84 26 84 42C84 58 74 70 58 70C42 70 32 58 32 42C32 26 42 12 58 12Z" fill={u("yellow")} u={u} />
          <path d="M58 20C69 20 76 30 76 42C76 54 69 62 58 62C47 62 40 54 40 42C40 30 47 20 58 20Z" fill={u("lilac")} />
          <Heart x={58} y={44} k={0.8} fill="#fff" />
          <path d="M53 70L48 84M63 70L68 84" stroke={u("wood")} strokeWidth="4" strokeLinecap="round" />
          <Spark x={94} y={20} r={7} fill="#fff" />
          <Spark x={22} y={56} r={4} fill="#fff" />
        </>
      );
    case "loss":
      return (
        <>
          <g transform="translate(60 26) scale(1.2)">
            <path d={CLOUD} fill={u("lilac")} />
          </g>
          <g fill={u("cyan")}>
            <path d="M44 42c3 5 4 7 4 9a4 4 0 0 1-8 0c0-2 1-4 4-9Z" />
            <path d="M66 44c3 5 4 7 4 9a4 4 0 0 1-8 0c0-2 1-4 4-9Z" />
          </g>
          <path d="M84 82V62" stroke={SHADE.leaf} strokeWidth="2.6" strokeLinecap="round" />
          <path d="M84 70C78 70 74 66 74 60C80 60 84 64 84 70Z" fill={u("leaf")} />
          <g transform="translate(84 58)">
            {[0, 72, 144, 216, 288].map((a) => (
              <ellipse key={a} cx="0" cy="-5" rx="3.6" ry="5" fill={u("coral")} transform={`rotate(${a})`} />
            ))}
            <circle r="3" fill="#FFD95A" />
          </g>
        </>
      );
    case "therapy":
      return (
        <>
          <rect x="16" y="14" width="40" height="40" rx="12" fill={u("logo")} />
          <LogoFace x={16} y={14} s={0.84} />
          <path d={bubblePath(64, 34, 42, 30, "br", 13)} fill="#fff" />
          <circle cx="76" cy="49" r="3" fill={u("brand")} />
          <circle cx="85" cy="49" r="3" fill={u("lilac")} />
          <circle cx="94" cy="49" r="3" fill={u("brand")} />
          <Spark x={58} y={14} r={5} />
        </>
      );
    case "boundaries":
      return (
        <>
          <circle cx="60" cy="46" r="32" fill="none" stroke={INK} strokeWidth="2.6" strokeDasharray="1 7" strokeLinecap="round" opacity=".45" />
          <circle cx="60" cy="46" r="18" fill={u("mint")} />
          <Face x={60} y={46} k={0.72} eyes="happy" mouth="smile" />
          <Spark x={98} y={18} r={6} fill="#fff" />
          <Heart x={22} y={24} k={0.4} fill={u("coral")} />
        </>
      );
    case "loneliness":
      return (
        <>
          <circle cx="60" cy="38" r="30" fill={u("glow")} />
          <path d="M60 10v8" stroke={INK} strokeWidth="2.4" strokeLinecap="round" opacity=".6" />
          <Tex d="M48 22H72L68 18H52Z" fill={u("coral")} u={u} />
          <Tex d="M48 22H72V52C72 56 70 58 66 58H54C50 58 48 56 48 52Z" fill={u("yellow")} u={u} />
          <circle cx="60" cy="40" r="7" fill="#fff" opacity=".85" />
          <path d="M44 60H76" stroke={u("coral")} strokeWidth="5" strokeLinecap="round" />
          <Spark x={96} y={20} r={6} fill="#fff" />
          <Spark x={24} y={30} r={4} fill="#fff" />
          <Spark x={92} y={68} r={3.5} fill="#fff" />
        </>
      );
    case "breathing":
      return (
        <>
          <circle cx="60" cy="46" r="30" fill="#fff" opacity=".35" />
          <circle cx="60" cy="46" r="20" fill="#fff" opacity=".55" />
          <g stroke={u("brand")} strokeWidth="3.2" strokeLinecap="round" fill="none">
            <path d="M34 40c14 0 22-10 34-4c6 3 6 12-2 12" />
            <path d="M40 56c14 0 26-4 38 0c6 2 4 10-2 9" />
          </g>
          <Spark x={96} y={20} r={5} fill="#fff" />
        </>
      );
    case "grounding":
      return (
        <>
          <ellipse cx="60" cy="72" rx="30" ry="9" fill={u("wood")} />
          <ellipse cx="60" cy="56" rx="22" ry="9" fill={u("lilac")} />
          <ellipse cx="60" cy="42" rx="15" ry="7" fill={u("cyan")} />
          <ellipse cx="60" cy="30" rx="9" ry="5" fill={u("coral")} />
          <path d="M60 25C58 16 62 10 70 8C70 16 66 22 60 25Z" fill={u("leaf")} />
          <Spark x={96} y={24} r={5} fill="#fff" />
        </>
      );
    case "body":
      return (
        <>
          <Heart x={60} y={50} k={2} fill={u("coral")} />
          <path d="M14 48H40L46 38L54 60L62 32L70 52L76 48H106" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <Spark x={98} y={18} r={5} fill="#fff" />
        </>
      );
    case "journaling":
      return (
        <>
          <g transform="rotate(-6 56 46)">
            <rect x="30" y="14" width="50" height="62" rx="8" fill="#fff" />
            <rect x="30" y="14" width="10" height="62" rx="5" fill={u("brand")} />
            <path d="M48 30h24M48 40h24M48 50h16" stroke="#B9C3E8" strokeWidth="2.6" strokeLinecap="round" />
          </g>
          <g transform="rotate(38 88 50)">
            <rect x="82" y="22" width="9" height="46" rx="3" fill={u("yellow")} />
            <path d="M82 68h9l-4.5 9Z" fill={u("wood")} />
            <rect x="82" y="22" width="9" height="7" rx="2" fill={u("coral")} />
          </g>
          <Heart x={62} y={62} k={0.36} fill={u("coral")} />
        </>
      );
    case "mindfulness":
      return (
        <>
          <g transform="translate(60 60)">
            <path d="M0 0C-8 -10 -8 -24 0 -34C8 -24 8 -10 0 0Z" fill={u("lilac")} />
            <path d="M0 0C-12 -4 -22 -14 -24 -26C-12 -24 -4 -14 0 0Z" fill={u("coral")} />
            <path d="M0 0C12 -4 22 -14 24 -26C12 -24 4 -14 0 0Z" fill={u("coral")} />
            <path d="M0 2C-16 4 -30 -2 -36 -12C-22 -14 -10 -8 0 2Z" fill={u("peach")} />
            <path d="M0 2C16 4 30 -2 36 -12C22 -14 10 -8 0 2Z" fill={u("peach")} />
          </g>
          <path d="M28 70c10 4 20 5 32 5s22-1 32-5" stroke={u("brand")} strokeWidth="3" strokeLinecap="round" fill="none" opacity=".6" />
          <Spark x={60} y={12} r={5} fill="#fff" />
        </>
      );
  }
}

const KNOWN = new Set<string>([
  "anxiety", "mood", "stress", "sleep", "relationships", "self", "loss", "therapy",
  "boundaries", "loneliness", "breathing", "grounding", "body", "journaling", "mindfulness",
]);

/** Topic or practice-kind motif; unknown keys fall back to the "therapy" motif. */
export function TopicArt({ topic, title, className }: { topic: string; title?: string; className?: string }) {
  const t = (KNOWN.has(topic) ? topic : "therapy") as TopicKey;
  return (
    <Svg viewBox="0 0 120 90" title={title} className={className}>
      {(u) => <Motif t={t} u={u} />}
    </Svg>
  );
}
