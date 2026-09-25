/**
 * Scene illustrations. Each is a self-contained SVG; pass `title` when the
 * picture carries meaning, otherwise it is decorative (aria-hidden).
 */
import { Blob, bubblePath, Dot, Face, Ground, Hand, INK, LogoFace, Person, Plant, SHADE, Spark, Svg, Tex, type U } from "./kit";
import s from "./illustrations.module.css";

export interface IllProps {
  title?: string;
  className?: string;
}

const TXT = { fontFamily: "var(--font)", fontWeight: 700 } as const;

function Note({ x, y, k = 1, fill }: { x: number; y: number; k?: number; fill: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${k})`} fill={fill}>
      <ellipse cx="0" cy="0" rx="6" ry="4.6" transform="rotate(-20)" />
      <rect x="4" y="-24" width="2.8" height="24" rx="1.4" />
      <path d="M5.4 -24c6 2 10 6 9 12c-2-4-5-5-9-5Z" />
    </g>
  );
}

function Heart({ x, y, k = 1, fill }: { x: number; y: number; k?: number; fill: string }) {
  return (
    <path
      transform={`translate(${x} ${y}) scale(${k})`}
      d="M0 8C-10 1 -14 -4 -14 -9C-14 -14 -10 -17 -6 -17C-3 -17 -1 -15 0 -13C1 -15 3 -17 6 -17C10 -17 14 -14 14 -9C14 -4 10 1 0 8Z"
      fill={fill}
    />
  );
}

function Cloud({ x, y, k = 1, cls }: { x: number; y: number; k?: number; cls?: string }) {
  return (
    <g className={cls}>
    <path
      transform={`translate(${x} ${y}) scale(${k})`}
      d="M-26 8C-34 8 -36 -4 -27 -6C-27 -16 -14 -20 -8 -12C-4 -22 12 -22 14 -10C24 -12 30 -2 24 6C22 8 20 8 18 8Z"
      fill="#fff"
      opacity=".9"
    />
    </g>
  );
}

function Armchair({ u, x, y, k = 1, tone = "coral" }: { u: U; x: number; y: number; k?: number; tone?: "coral" | "lilac" | "cyan" | "brand" }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${k})`}>
      <path d="M-44 40l-4 18M44 40l4 18" stroke="#C98A55" strokeWidth="6" strokeLinecap="round" />
      <Tex d="M-50 -40C-50 -64 -30 -70 0 -70C30 -70 50 -64 50 -40V20H-50Z" fill={u(tone)} u={u} />
      <path d="M-30 -52C-14 -56 14 -56 30 -52" stroke={SHADE[tone]} strokeWidth="1.8" strokeLinecap="round" fill="none" opacity=".5" />
      <Tex d="M-54 14C-54 4 -44 0 0 0C44 0 54 4 54 14V36C54 44 48 46 40 46H-40C-48 46 -54 44 -54 36Z" fill={u(tone)} u={u} />
      <path d="M-40 14H40" stroke={SHADE[tone]} strokeWidth="1.8" strokeLinecap="round" opacity=".45" />
      <Tex d="M-72 -10C-72 -22 -54 -22 -54 -10V40C-54 48 -72 48 -72 40Z" fill={u(tone)} u={u} />
      <Tex d="M72 -10C72 -22 54 -22 54 -10V40C54 48 72 48 72 40Z" fill={u(tone)} u={u} />
    </g>
  );
}

function Mug({ x, y, k = 1, u, tone = "cyan", steam = true }: { x: number; y: number; k?: number; u: U; tone?: "cyan" | "yellow" | "lilac" | "coral"; steam?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${k})`}>
      {steam && (
        <path
          d="M-5 -26c-4-5 4-8 0-14M5 -26c-4-5 4-8 0-14"
          stroke="currentColor"
          className={s.line}
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      )}
      <path d="M10 -14c9 0 9 12 0 12" stroke={u(tone)} strokeWidth="4" fill="none" />
      <Tex d="M-12 -20H12V-4C12 2 7 4 0 4C-7 4 -12 2 -12 -4Z" fill={u(tone)} u={u} />
      <Heart x={0} y={-10} k={0.28} fill="#fff" />
    </g>
  );
}

/* ── Big scenes ────────────────────────────────────────────────────────── */

/** Two people talking; the client speaks through the smiling bubble avatar. */
export function HeroConversation({ title, className }: IllProps) {
  return (
    <Svg viewBox="0 0 360 280" title={title} className={className}>
      {(u) => (
        <>
          <Blob d="M60 90C80 30 160 10 230 30C300 50 350 110 330 180C312 244 240 268 170 262C90 256 20 220 26 160C29 128 44 110 60 90Z" />
          <circle cx="300" cy="60" r="26" className={s.blob2} />
          <Dot x={40} y={70} r={4} cls="dotAlt" />
          <Dot x={332} y={214} r={3.5} />
          <Dot x={22} y={200} r={3} />
          <g className={s.float}>
            <path d={bubblePath(26, 26, 104, 42, "br", 18)} fill={u("cyan")} />
            <text x="78" y="53" textAnchor="middle" fontSize="17" fill={INK} style={TXT}>
              Привет!
            </text>
          </g>
          <g className={s.float} style={{ animationDelay: "-3s" }}>
            <path d={bubblePath(230, 44, 74, 38, "bl", 16)} fill={u("white")} />
            <circle cx="252" cy="63" r="4" fill={u("lilac")} />
            <circle cx="267" cy="63" r="4" fill={u("brand")} />
            <circle cx="282" cy="63" r="4" fill={u("lilac")} />
          </g>
          <Person u={u} x={112} y={148} k={1.05} skin="skinB" hair="curly" hairColor="hairCoral" top="lilac" mask />
          <Person u={u} x={258} y={150} k={1.02} skin="skinD" hair="bob" hairColor="hairDark" top="cyan" glasses look={-2} flip />
          <g transform="translate(222 222) rotate(-8)">
            <rect x="-20" y="-26" width="40" height="46" rx="7" fill={u("white")} />
            <path d="M-12 -14h24M-12 -6h24M-12 2h14" stroke="#B9C3E8" strokeWidth="2.4" strokeLinecap="round" />
            <rect x="-8" y="-30" width="16" height="7" rx="3" fill={u("coral")} />
          </g>
          <Tex d="M20 238C20 231 26 228 34 228H326C334 228 340 231 340 238V262H20Z" fill={u("wood")} u={u} />
          <path d="M40 240H320" stroke={SHADE.wood} strokeWidth="1.6" strokeLinecap="round" opacity=".5" />
          <Mug x={180} y={226} k={0.95} u={u} tone="yellow" />
          <Spark x={184} y={112} r={11} />
          <g className={s.twinkle}>
            <Spark x={208} y={86} r={5.5} fill="#8FE6F0" />
          </g>
          <Spark x={330} y={130} r={7} fill="#CBBEFF" />
        </>
      )}
    </Svg>
  );
}

/** A person holding the smiling bubble in front of their face: the avatar idea. */
export function MaskFriend({ title, className }: IllProps) {
  return (
    <Svg viewBox="0 0 240 210" title={title} className={className}>
      {(u) => (
        <>
          <circle cx="120" cy="106" r="92" className={s.blob} />
          <circle cx="196" cy="46" r="18" className={s.blob2} />
          <Dot x={34} y={60} r={4} cls="dotAlt" />
          <Dot x={214} y={150} r={3} />
          <Person u={u} x={122} y={100} k={1.08} skin="skinC" hair="short" hairColor="hairDark" top="brand" mask />
          <g className={s.twinkle}>
            <Spark x={182} y={56} r={10} />
          </g>
          <Spark x={60} y={36} r={6} fill="#8FE6F0" />
        </>
      )}
    </Svg>
  );
}

/** Waving person in a straw hat with a cyan "Привет!" bubble (the reference). */
export function Hello({ title, className, text = "Привет!" }: IllProps & { text?: string }) {
  return (
    <Svg viewBox="0 0 240 220" title={title} className={className}>
      {(u) => (
        <>
          <path d="M28 120C20 60 70 24 126 26C186 28 226 74 214 134C204 186 160 214 110 210C58 206 34 170 28 120Z" className={s.blob} />
          <Dot x={24} y={70} r={4} cls="dotAlt" />
          <Dot x={218} y={190} r={3} />
          <Person u={u} x={104} y={112} k={1.06} skin="skinB" hair="bob" hairColor="hairBrown" top="cyan" eyes="happy" mouth="open" hat wave="right" />
          <g className={s.float}>
            <path d={bubblePath(138, 22, 90, 38, "bl", 17)} fill={u("cyan")} />
            <text x="183" y="47" textAnchor="middle" fontSize="16" fill={INK} style={TXT}>
              {text}
            </text>
          </g>
          <Spark x={36} y={40} r={9} />
          <Spark x={208} y={108} r={6} fill="#CBBEFF" />
        </>
      )}
    </Svg>
  );
}

/** Calm seated figure breathing, with soft expanding rings. */
export function Breathing({ title, className }: IllProps) {
  return (
    <Svg viewBox="0 0 240 210" title={title} className={className}>
      {(u) => (
        <>
          <g className={s.breathe}>
            <circle cx="120" cy="104" r="94" className={s.blob} />
            <circle cx="120" cy="104" r="70" className={s.blob3} />
          </g>
          <Ground cx={120} cy={194} rx={80} ry={8} />
          <Tex d="M42 186C38 164 70 156 120 166C170 156 202 164 198 186C196 196 44 196 42 186Z" fill={u("lilac")} u={u} />
          <path d="M120 168V190" stroke={SHADE.lilac} strokeWidth="1.8" strokeLinecap="round" opacity=".5" />
          <Person u={u} x={120} y={82} k={0.94} skin="skinD" hair="bun" hairColor="hairDark" top="mint" eyes="sleep" mouth="calm" />
          <path d="M94 142C84 152 76 164 72 176M146 142C156 152 164 164 168 176" stroke={u("mint")} strokeWidth="12" strokeLinecap="round" fill="none" />
          <circle cx="70" cy="178" r="7" fill={u("skinD")} />
          <circle cx="170" cy="178" r="7" fill={u("skinD")} />
          <g stroke="#8FE6F0" strokeWidth="2.2" strokeLinecap="round" fill="none" opacity=".9">
            <path d="M180 64c8-4 14 2 22-2M186 76c6-3 10 1 16-1" />
            <path d="M38 64c8-4 14 2 22-2M38 76c6-3 10 1 16-1" />
          </g>
          <path d="M196 132C188 120 190 108 204 102C206 116 204 126 196 132Z" fill={u("leaf")} />
          <path d="M40 124C48 114 58 112 66 118C58 128 48 130 40 124Z" fill={u("leaf")} />
          <g className={s.twinkle}>
            <Spark x={120} y={20} r={8} />
          </g>
        </>
      )}
    </Svg>
  );
}

/** Figure in headphones with music notes (audio practices). */
export function Listening({ title, className }: IllProps) {
  return (
    <Svg viewBox="0 0 240 210" title={title} className={className}>
      {(u) => (
        <>
          <path d="M30 110C24 56 74 20 128 24C184 28 222 72 212 128C202 182 156 208 108 204C60 200 34 160 30 110Z" className={s.blob} />
          <Person u={u} x={116} y={100} k={1.05} skin="skinA" hair="short" hairColor="hairBrown" top="yellow" eyes="happy" mouth="smile" headphones />
          <g className={s.float}>
            <Note x={188} y={70} fill={u("lilac")} />
            <Note x={40} y={96} k={0.8} fill={u("cyan")} />
          </g>
          <Note x={200} y={128} k={0.7} fill={u("coral")} />
          <Spark x={52} y={40} r={8} />
          <Dot x={212} y={30} r={4} cls="dotAlt" />
        </>
      )}
    </Svg>
  );
}

/** Cozy armchair, plant and lamp: a calm, empty room. */
export function CozyCorner({ title, className }: IllProps) {
  return (
    <Svg viewBox="0 0 240 200" title={title} className={className}>
      {(u) => (
        <>
          <path d="M20 110C16 56 64 22 122 24C182 26 224 64 218 120C212 170 170 196 118 194C62 192 24 160 20 110Z" className={s.blob} />
          <ellipse cx="116" cy="178" rx="92" ry="12" fill={u("lilac")} opacity=".45" />
          <circle cx="42" cy="58" r="30" fill={u("glow")} />
          <path d="M42 70V176" stroke="#C98A55" strokeWidth="4" strokeLinecap="round" />
          <path d="M32 176h20" stroke={SHADE.wood} strokeWidth="4" strokeLinecap="round" />
          <Tex d="M28 42H56L64 68H20Z" fill={u("yellow")} u={u} />
          <Armchair u={u} x={116} y={124} k={0.8} tone="coral" />
          <path d="M100 118C104 108 124 106 134 114" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity=".35" fill="none" />
          <Plant x={198} y={178} k={0.85} u={u} pot="cyan" />
          <Spark x={176} y={40} r={7} />
          <Dot x={206} y={70} r={3} />
        </>
      )}
    </Svg>
  );
}

/** Person with a mug in the armchair: waiting for the specialist. */
export function TeaWait({ title, className }: IllProps) {
  return (
    <Svg viewBox="0 0 260 220" title={title} className={className}>
      {(u) => (
        <>
          <path d="M26 120C20 60 70 22 132 24C196 26 240 70 232 130C224 186 178 214 126 212C66 210 30 176 26 120Z" className={s.blob} />
          <ellipse cx="130" cy="200" rx="96" ry="10" className={s.ground} />
          <g transform="translate(208 50)">
            <circle r="22" fill={u("white")} />
            <circle r="22" fill="none" stroke={u("brand")} strokeWidth="4" />
            <path d="M0 -12V0L8 5" stroke={INK} strokeWidth="2.6" strokeLinecap="round" fill="none" />
          </g>
          <Armchair u={u} x={124} y={150} k={0.9} tone="lilac" />
          <Person u={u} x={124} y={92} k={0.92} skin="skinB" hair="curly" hairColor="hairCoral" top="yellow" eyes="happy" mouth="calm" />
          <Tex d="M72 170C72 162 80 160 124 160C168 160 176 162 176 170V190C176 192 174 193 172 193H76C74 193 72 192 72 190Z" fill={u("lilac")} u={u} />
          <path d="M84 170H164" stroke={SHADE.lilac} strokeWidth="1.8" strokeLinecap="round" opacity=".45" />
          <path d="M94 136C98 150 106 156 116 156M154 136C150 150 142 156 132 156" stroke={u("yellow")} strokeWidth="11" strokeLinecap="round" fill="none" />
          <Mug x={124} y={160} u={u} tone="cyan" />
          <circle cx="112" cy="152" r="5.5" fill={u("skinB")} />
          <circle cx="136" cy="152" r="5.5" fill={u("skinB")} />
          <g className={s.twinkle}>
            <Spark x={46} y={48} r={8} />
          </g>
          <Dot x={32} y={96} r={3.5} cls="dotAlt" />
        </>
      )}
    </Svg>
  );
}

/** Calendar page with a highlighted, hearted date and a sparkle. */
export function CalendarSparkle({ title, className }: IllProps) {
  const cells: [number, number][] = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) cells.push([72 + c * 24, 98 + r * 22]);
  return (
    <Svg viewBox="0 0 240 200" title={title} className={className}>
      {(u) => (
        <>
          <circle cx="120" cy="104" r="88" className={s.blob} />
          <Ground cx={122} cy={184} rx={70} ry={7} />
          <g transform="rotate(-4 120 110)">
            <rect x="54" y="46" width="132" height="130" rx="20" className={s.paper} />
            <Tex d="M54 66C54 55 63 46 74 46H166C177 46 186 55 186 66V80H54Z" fill={u("logo")} u={u} />
            <rect x="82" y="36" width="8" height="22" rx="4" fill={INK} />
            <rect x="150" y="36" width="8" height="22" rx="4" fill={INK} />
            {cells.map(([x, y], i) =>
              i === 7 ? null : <rect key={i} x={x - 7} y={y - 7} width="14" height="14" rx="5" fill={i === 3 || i === 11 ? "#CBBEFF" : "#DDE3F6"} />,
            )}
            <circle cx={cells[7][0]} cy={cells[7][1]} r="13" fill={u("coral")} />
            <Heart x={cells[7][0]} y={cells[7][1] + 1} k={0.42} fill="#fff" />
          </g>
          <g className={s.twinkle}>
            <Spark x={196} y={44} r={13} />
          </g>
          <Spark x={40} y={70} r={6} fill="#8FE6F0" />
          <Dot x={206} y={150} r={3.5} cls="dotAlt" />
        </>
      )}
    </Svg>
  );
}

/** A friendly shield with a padlock: privacy. */
export function ShieldFriend({ title, className }: IllProps) {
  return (
    <Svg viewBox="0 0 240 210" title={title} className={className}>
      {(u) => (
        <>
          <circle cx="120" cy="106" r="90" className={s.blob} />
          <Ground cx={120} cy={196} rx={56} ry={7} />
          <Tex d="M120 22C142 36 166 40 188 40C190 110 170 160 120 188C70 160 50 110 52 40C74 40 98 36 120 22Z" fill={u("logo")} u={u} />
          <path d="M120 40C136 50 154 54 170 55C170 108 154 146 120 168C86 146 70 108 70 55C86 54 104 50 120 40Z" fill="#fff" opacity=".96" />
          <Face x={120} y={100} k={1.3} eyes="happy" mouth="smile" />
          <g transform="translate(182 150) rotate(10)">
            <path d="M-11 -8V-15C-11 -28 11 -28 11 -15V-8" stroke="#9AA6CF" strokeWidth="5" fill="none" strokeLinecap="round" />
            <Tex d="M-18 -10C-18 -13 -16 -14 -13 -14H13C16 -14 18 -13 18 -10V12C18 16 16 18 12 18H-12C-16 18 -18 16 -18 12Z" fill={u("yellow")} u={u} />
            <circle cx="0" cy="0" r="3.4" fill={INK} />
            <path d="M0 2V8" stroke={INK} strokeWidth="3" strokeLinecap="round" />
          </g>
          <g className={s.twinkle}>
            <Spark x={196} y={30} r={10} />
          </g>
          <Spark x={44} y={70} r={6} fill="#8FE6F0" />
          <Dot x={40} y={150} r={4} cls="dotAlt" />
        </>
      )}
    </Svg>
  );
}

/** A mirror that reflects the bubble avatar instead of a face (camera check). */
export function MirrorAvatar({ title, className }: IllProps) {
  return (
    <Svg viewBox="0 0 240 220" title={title} className={className}>
      {(u) => (
        <>
          <path d="M28 116C22 60 70 24 126 24C186 24 226 70 214 130C204 186 160 214 110 210C58 206 32 168 28 116Z" className={s.blob} />
          <Ground cx={120} cy={206} rx={54} ry={7} />
          <path d="M120 176V204M96 204H144" stroke={u("wood")} strokeWidth="7" strokeLinecap="round" />
          <Tex d="M120 22C156 22 176 56 176 100C176 146 152 176 120 176C88 176 64 146 64 100C64 56 84 22 120 22Z" fill={u("yellow")} u={u} />
          <path d="M120 34C148 34 164 62 164 100C164 138 146 164 120 164C94 164 76 138 76 100C76 62 92 34 120 34Z" fill={u("brand")} />
          <path d="M120 34C148 34 164 62 164 100C164 138 146 164 120 164C94 164 76 138 76 100C76 62 92 34 120 34Z" fill={u("glowBlue")} />
          <LogoFace x={85} y={60} s={1.5} />
          <path d="M88 64C92 52 100 44 110 40M86 80L90 70" stroke="#fff" strokeWidth="4" strokeLinecap="round" opacity=".45" fill="none" />
          <g className={s.twinkle}>
            <Spark x={188} y={46} r={10} />
          </g>
          <Spark x={46} y={60} r={6} fill="#8FE6F0" />
          <Spark x={196} y={150} r={5} fill="#CBBEFF" />
        </>
      )}
    </Svg>
  );
}

/** A little stack of chat bubbles. */
export function ChatBubbles({ title, className }: IllProps) {
  return (
    <Svg viewBox="0 0 240 200" title={title} className={className}>
      {(u) => (
        <>
          <circle cx="120" cy="100" r="88" className={s.blob} />
          <g className={s.float}>
            <path d={bubblePath(34, 38, 112, 50, "bl", 22)} fill={u("cyan")} />
            <circle cx="66" cy="63" r="5.5" fill={INK} opacity=".85" />
            <circle cx="90" cy="63" r="5.5" fill={INK} opacity=".55" />
            <circle cx="114" cy="63" r="5.5" fill={INK} opacity=".3" />
          </g>
          <path d={bubblePath(96, 104, 112, 52, "br", 22)} fill={u("logo")} />
          <path d={bubblePath(96, 104, 112, 52, "br", 22)} fill={u("grain")} />
          <path d="M116 122H182M116 138H160" stroke="#fff" strokeWidth="5" strokeLinecap="round" opacity=".9" />
          <path d={bubblePath(40, 118, 44, 36, "bl", 16)} fill={u("coral")} />
          <Heart x={62} y={138} k={0.55} fill="#fff" />
          <g className={s.twinkle}>
            <Spark x={186} y={42} r={10} />
          </g>
          <Dot x={206} y={82} r={4} cls="dotAlt" />
          <Dot x={30} y={176} r={3} />
        </>
      )}
    </Svg>
  );
}

/** Sleepy crescent moon with stars: a quiet, empty place. */
export function SleepingMoon({ title, className }: IllProps) {
  return (
    <Svg viewBox="0 0 240 200" title={title} className={className}>
      {(u) => {
        const m = u.id("moonCut");
        return (
          <>
            <circle cx="120" cy="100" r="88" className={s.blob} />
            <mask id={m}>
              <rect width="240" height="200" fill="#fff" />
              <circle cx="146" cy="72" r="50" fill="#000" />
            </mask>
            <g mask={`url(#${m})`}>
              <Tex d="M112 40A60 60 0 1 0 112 160A60 60 0 1 0 112 40Z" fill={u("yellow")} u={u} />
            </g>
            <g transform="rotate(-24 84 128)">
              <Face x={82} y={124} k={1.2} eyes="sleep" mouth="calm" />
            </g>
            <Cloud x={176} y={150} k={1.1} cls={s.float} />
            <g fill={u("lilac")} style={{ fontFamily: "var(--font)", fontWeight: 800 }}>
              <text x="150" y="58" fontSize="20">
                z
              </text>
              <text x="168" y="40" fontSize="15">
                z
              </text>
              <text x="182" y="26" fontSize="11">
                z
              </text>
            </g>
            <g className={s.twinkle}>
              <Spark x={196} y={86} r={8} />
            </g>
            <Spark x={44} y={50} r={6} fill="#CBBEFF" />
            <Spark x={62} y={176} r={4} fill="#8FE6F0" />
          </>
        );
      }}
    </Svg>
  );
}

/** Smiling sun rising over soft hills: a greeting. */
export function Sunrise({ title, className, night }: IllProps & { night?: boolean }) {
  return (
    <Svg viewBox="0 0 240 170" title={title} className={className}>
      {(u) => {
        const c = u.id("sunClip");
        return (
          <>
            <clipPath id={c}>
              <rect x="0" y="0" width="240" height="170" rx="0" />
            </clipPath>
            <g clipPath={`url(#${c})`}>
              <circle cx="120" cy="112" r="80" fill={u(night ? "glowBlue" : "glow")} />
              <g stroke={night ? "#CBBEFF" : "#FFD95A"} strokeWidth="5" strokeLinecap="round" opacity=".9">
                {!night &&
                  [-160, -125, -90, -55, -20].map((a) => {
                    const t = (a * Math.PI) / 180;
                    return <line key={a} x1={120 + Math.cos(t) * 56} y1={112 + Math.sin(t) * 56} x2={120 + Math.cos(t) * 70} y2={112 + Math.sin(t) * 70} />;
                  })}
              </g>
              <Tex d="M120 68A44 44 0 1 1 119.9 68Z" fill={u(night ? "lilac" : "yellow")} u={u} />
              <Face x={120} y={106} k={1.35} eyes={night ? "sleep" : "happy"} mouth="smile" />
              <Tex d="M-10 150C30 118 80 118 128 140C168 124 214 118 250 136V180H-10Z" fill={u("mint")} u={u} />
              <Tex d="M-10 162C40 146 90 150 130 162C170 150 210 150 250 158V180H-10Z" fill={u("leaf")} u={u} />
              <Cloud x={196} y={52} k={0.9} cls={s.float} />
              <Cloud x={44} y={70} k={0.7} />
              <Spark x={30} y={30} r={7} fill={night ? "#FFD95A" : "#8FE6F0"} />
            </g>
          </>
        );
      }}
    </Svg>
  );
}

/** Paper plane with a looping dashed trail: sent. */
export function PaperPlane({ title, className }: IllProps) {
  return (
    <Svg viewBox="0 0 240 190" title={title} className={className}>
      {(u) => (
        <>
          <circle cx="126" cy="96" r="84" className={s.blob} />
          <path
            d="M20 168C64 176 92 156 76 136C62 118 40 140 60 150C84 162 110 136 118 118"
            className={s.line}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray="2 9"
          />
          <g className={s.float}>
            <path d="M206 40L84 90L126 104Z" fill={u("white")} stroke="#C7CEEA" strokeWidth="1.2" strokeLinejoin="round" />
            <path d="M206 40L126 104L138 146Z" fill={u("lilac")} />
            <path d="M126 104L138 146L146 118Z" fill={SHADE.lilac} />
            <path d="M206 40L126 104" stroke="#B9C3E8" strokeWidth="1.4" />
          </g>
          <Heart x={62} y={70} k={0.5} fill={u("coral")} />
          <g className={s.twinkle}>
            <Spark x={212} y={110} r={9} />
          </g>
          <Spark x={100} y={40} r={5} fill="#8FE6F0" />
        </>
      )}
    </Svg>
  );
}

/** A magnifier that finds a small friendly face: search. */
export function MagnifierFind({ title, className, empty }: IllProps & { empty?: boolean }) {
  return (
    <Svg viewBox="0 0 240 200" title={title} className={className}>
      {(u) => {
        const c = u.id("lens");
        return (
          <>
            <circle cx="120" cy="100" r="88" className={s.blob} />
            <Ground cx={130} cy={188} rx={62} ry={6} />
            <path d="M142 124L186 168" stroke={u("coral")} strokeWidth="18" strokeLinecap="round" />
            <path d="M142 124L186 168" stroke={u("grain")} strokeWidth="18" strokeLinecap="round" />
            <clipPath id={c}>
              <circle cx="104" cy="88" r="46" />
            </clipPath>
            <circle cx="104" cy="88" r="46" fill={u("cyan")} opacity=".35" />
            <g clipPath={`url(#${c})`}>
              {empty ? (
                <>
                  <Face x={104} y={90} k={1.4} eyes="dot" mouth="o" look={-1.5} cheeks />
                </>
              ) : (
                <Person u={u} x={104} y={96} k={0.92} skin="skinB" hair="curly" hairColor="hairCoral" top="brand" eyes="dot" mouth="smile" />
              )}
            </g>
            <circle cx="104" cy="88" r="46" fill="none" stroke={u("logo")} strokeWidth="11" />
            <path d="M74 66C80 56 90 50 100 48" stroke="#fff" strokeWidth="5" strokeLinecap="round" opacity=".6" fill="none" />
            {empty && (
              <g fill={u("lilac")} style={{ fontFamily: "var(--font)", fontWeight: 800 }}>
                <text x="164" y="60" fontSize="30">
                  ?
                </text>
              </g>
            )}
            <g className={s.twinkle}>
              <Spark x={186} y={34} r={9} />
            </g>
            <Dot x={40} y={160} r={4} cls="dotAlt" />
          </>
        );
      }}
    </Svg>
  );
}

/** A heart held in two hands: support and care. */
export function HeartHands({ title, className }: IllProps) {
  // One cupped hand (left); the right one is its mirror. Fingertips curl up at the outer edge.
  const hand =
    "M122 156C104 164 74 160 62 140C54 127 54 112 60 105C64 100 71 102 73 109C75 100 83 98 88 105C90 98 98 98 101 106C104 100 112 101 113 109C117 112 121 118 122 126Z";
  const sleeve = "M70 146L58 210H114L121 156Z";
  const lines = "M73 110C74 118 76 124 80 128M88 106C89 114 91 120 94 124M101 107C102 114 104 119 107 122";
  return (
    <Svg viewBox="0 0 240 200" title={title} className={className}>
      {(u) => (
        <>
          <circle cx="120" cy="96" r="88" className={s.blob} />
          <circle cx="120" cy="86" r="58" fill={u("glow")} />
          <g className={s.float}>
            <Heart x={120} y={92} k={2.7} fill={u("coral")} />
            <Heart x={120} y={92} k={2.7} fill={u("grain")} />
            <path d="M94 58C98 50 106 48 112 52" stroke="#fff" strokeWidth="5" strokeLinecap="round" opacity=".5" fill="none" />
          </g>
          <path d={sleeve} fill={u("cyan")} />
          <Tex d={hand} fill={u("skinB")} u={u} />
          <path d={lines} stroke={SHADE.skinB} strokeWidth="1.6" strokeLinecap="round" fill="none" opacity=".7" />
          <g transform="translate(240 0) scale(-1 1)">
            <path d={sleeve} fill={u("lilac")} />
            <Tex d={hand} fill={u("skinD")} u={u} />
            <path d={lines} stroke={SHADE.skinD} strokeWidth="1.6" strokeLinecap="round" fill="none" opacity=".7" />
          </g>
          <g className={s.twinkle}>
            <Spark x={192} y={36} r={9} />
          </g>
          <Spark x={48} y={46} r={6} fill="#8FE6F0" />
          <Dot x={206} y={120} r={3.5} cls="dotAlt" />
        </>
      )}
    </Svg>
  );
}

/** The bubble mascot, lost, with a signpost: 404 / errors. */
export function LostBubble({ title, className }: IllProps) {
  return (
    <Svg viewBox="0 0 260 220" title={title} className={className}>
      {(u) => (
        <>
          <path d="M30 116C24 58 76 22 134 24C196 26 238 72 228 132C218 188 172 214 122 210C64 206 36 170 30 116Z" className={s.blob} />
          <Ground cx={130} cy={200} rx={90} ry={8} />
          <path d="M196 70V198" stroke="#C98A55" strokeWidth="7" strokeLinecap="round" />
          <Tex d="M170 70H222L232 82L222 94H170Z" fill={u("cyan")} u={u} />
          <Tex d="M222 104H172L162 116L172 128H222Z" fill={u("coral")} u={u} />
          <g transform="rotate(-8 100 120)">
            <rect x="46" y="54" width="112" height="112" rx="34" fill={u("logo")} />
            <rect x="46" y="54" width="112" height="112" rx="34" fill={u("grain")} />
            <LogoFace x={54} y={58} s={2} eyes="dot" />
            <Spark x={142} y={68} r={8} />
          </g>
          <g style={{ fontFamily: "var(--font)", fontWeight: 800 }} fill={u("yellow")}>
            <text x="30" y="60" fontSize="34" transform="rotate(-12 30 60)">
              ?
            </text>
          </g>
          <Dot x={234} y={40} r={4} cls="dotAlt" />
          <Spark x={226} y={160} r={5} fill="#CBBEFF" />
        </>
      )}
    </Svg>
  );
}

/** A smiling key with sparkles: recovery key. */
export function KeyFriend({ title, className }: IllProps) {
  return (
    <Svg viewBox="0 0 240 190" title={title} className={className}>
      {(u) => (
        <>
          <circle cx="120" cy="96" r="84" className={s.blob} />
          <g transform="rotate(-18 120 100)">
            <Tex d="M110 90H206C212 90 214 94 214 98V104C214 108 212 112 206 112H196V128C196 132 192 134 188 134H180C176 134 174 132 174 128V112H164V122C164 126 162 128 158 128H152C148 128 146 126 146 122V112H110Z" fill={u("yellow")} u={u} />
            <Tex d="M84 56A45 45 0 1 1 83.9 56Z" fill={u("yellow")} u={u} />
            <circle cx="84" cy="101" r="31" fill="#fff" opacity=".96" />
            <Face x={84} y={100} k={1.15} eyes="happy" mouth="smile" />
          </g>
          <g className={s.twinkle}>
            <Spark x={196} y={40} r={11} />
          </g>
          <Spark x={40} y={50} r={6} fill="#8FE6F0" />
          <Spark x={206} y={150} r={6} fill="#CBBEFF" />
        </>
      )}
    </Svg>
  );
}

/** A specialist with glasses, notebook and a verified badge. */
export function SpecialistFriend({ title, className }: IllProps) {
  return (
    <Svg viewBox="0 0 240 210" title={title} className={className}>
      {(u) => (
        <>
          <path d="M26 112C20 56 70 20 126 22C186 24 226 70 214 130C204 184 158 212 108 208C58 204 32 166 26 112Z" className={s.blob} />
          <Person u={u} x={112} y={100} k={1.05} skin="skinA" hair="long" hairColor="hairBrown" top="coral" glasses eyes="dot" mouth="smile" />
          <g transform="translate(164 172) rotate(8)">
            <rect x="-24" y="-30" width="48" height="56" rx="8" className={s.paper} />
            <path d="M-14 -16h28M-14 -6h28M-14 4h18" stroke="#B9C3E8" strokeWidth="2.6" strokeLinecap="round" />
            <rect x="-9" y="-35" width="18" height="8" rx="3.5" fill={u("coral")} />
          </g>
          <g transform="translate(172 58)">
            <circle r="20" fill={u("mint")} />
            <path d="M-8 0L-2 6L9 -6" stroke="#fff" strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </g>
          <Spark x={40} y={44} r={8} />
          <Dot x={32} y={150} r={4} cls="dotAlt" />
        </>
      )}
    </Svg>
  );
}

/** Two friends side by side with a heart bubble: support, together. */
export function Together({ title, className }: IllProps) {
  return (
    <Svg viewBox="0 0 280 210" title={title} className={className}>
      {(u) => (
        <>
          <path d="M30 116C24 60 80 22 142 24C206 26 256 70 248 130C240 184 192 212 138 208C78 204 36 170 30 116Z" className={s.blob} />
          <Person u={u} x={96} y={104} k={0.98} skin="skinC" hair="buzz" hairColor="hairDark" top="coral" eyes="happy" />
          <Person u={u} x={186} y={108} k={0.94} skin="skinA" hair="curly" hairColor="hairCoral" top="cyan" eyes="happy" mouth="open" />
          <g className={s.float}>
            <path d={bubblePath(118, 18, 46, 38, "bl", 17)} fill={u("white")} />
            <Heart x={141} y={38} k={0.6} fill={u("coral")} />
          </g>
          <Spark x={236} y={46} r={8} />
          <Spark x={44} y={50} r={6} fill="#8FE6F0" />
        </>
      )}
    </Svg>
  );
}

/** A few sparkles for decorating headers. */
export function SparkleSet({ title, className }: IllProps) {
  return (
    <Svg viewBox="0 0 120 80" title={title} className={className}>
      {() => (
        <>
          <g className={s.twinkle}>
            <Spark x={40} y={38} r={22} />
          </g>
          <Spark x={86} y={20} r={10} fill="#8FE6F0" />
          <Spark x={92} y={60} r={8} fill="#CBBEFF" />
          <Spark x={14} y={66} r={6} fill="#FFB199" />
        </>
      )}
    </Svg>
  );
}

/** Door with a warm light and a welcome mat: sign in. */
export function DoorWelcome({ title, className }: IllProps) {
  return (
    <Svg viewBox="0 0 240 220" title={title} className={className}>
      {(u) => (
        <>
          <circle cx="120" cy="106" r="92" className={s.blob} />
          <Tex d="M70 200V70C70 44 92 26 120 26C148 26 170 44 170 70V200Z" fill={u("logo")} u={u} />
          <path d="M84 200V74C84 54 100 40 120 40C140 40 156 54 156 74V200Z" fill={u("yellow")} />
          <circle cx="120" cy="120" r="46" fill={u("glow")} />
          <Tex d="M156 66L190 48V208L156 200Z" fill={u("coral")} u={u} />
          <circle cx="182" cy="134" r="3.6" fill={INK} opacity=".55" />
          <g className={s.float}>
            <path d={bubblePath(94, 84, 52, 40, "bl", 18)} fill="#fff" />
            <Heart x={120} y={106} k={0.62} fill={u("coral")} />
          </g>
          <Tex d="M56 200C56 196 62 194 120 194C178 194 184 196 184 200V206H56Z" fill={u("cyan")} u={u} />
          <Plant x={36} y={206} k={0.68} u={u} pot="yellow" />
          <g className={s.twinkle}>
            <Spark x={194} y={30} r={9} />
          </g>
          <Spark x={44} y={70} r={6} fill="#8FE6F0" />
        </>
      )}
    </Svg>
  );
}

/** Small smiling sun (day) or sleepy moon (night) sticker for greetings. */
export function Celestial({ title, className, night }: IllProps & { night?: boolean }) {
  return (
    <Svg viewBox="0 0 80 80" title={title} className={className}>
      {(u) => {
        const m = u.id("cel");
        return night ? (
          <>
            <mask id={m}>
              <rect width="80" height="80" fill="#fff" />
              <circle cx="52" cy="28" r="22" fill="#000" />
            </mask>
            <g mask={`url(#${m})`}>
              <Tex d="M38 12A28 28 0 1 0 38 68A28 28 0 1 0 38 12Z" fill={u("yellow")} u={u} />
            </g>
            <g transform="rotate(-24 26 50)">
              <Face x={25} y={48} k={0.62} eyes="sleep" mouth="calm" />
            </g>
            <Spark x={66} y={52} r={6} fill="#fff" />
            <Spark x={58} y={10} r={4} fill="#FFE17C" />
          </>
        ) : (
          <>
            <g stroke="#FFD95A" strokeWidth="4" strokeLinecap="round">
              {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
                const r = (a * Math.PI) / 180;
                return <line key={a} x1={40 + Math.cos(r) * 29} y1={40 + Math.sin(r) * 29} x2={40 + Math.cos(r) * 36} y2={40 + Math.sin(r) * 36} />;
              })}
            </g>
            <Tex d="M40 18A22 22 0 1 1 39.9 18Z" fill={u("yellow")} u={u} />
            <Face x={40} y={41} k={0.78} eyes="happy" mouth="smile" />
          </>
        );
      }}
    </Svg>
  );
}

export { Hand };
