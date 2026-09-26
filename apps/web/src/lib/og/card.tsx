/**
 * Link-preview cards (Open Graph / Twitter), 1200×630 PNG, rendered by
 * next/og. Laconic by design: the logo mark, a title of at most five words,
 * one line of subtitle and a small illustration in the logo palette.
 *
 * Usage in a route segment (opengraph-image.tsx / twitter-image.tsx):
 *
 *   export const alt = "…"; export const size = OG_SIZE; export const contentType = OG_TYPE;
 *   export default () => ogCard({ title: "…", subtitle: "…", art: "book" });
 *
 * Node.js runtime (static sections are prerendered at build). Fonts: Onest 500/700
 * (SIL OFL, public/fonts/og/OFL.txt), WOFF because satori reads no WOFF2.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_TYPE = "image/png";

export type OgArt = "bubble" | "book" | "breath" | "chat" | "key" | "badge" | "doc" | "lock";

export interface OgCardProps {
  title: string;
  subtitle: string;
  art: OgArt;
  /** small label above the title (section name), optional */
  kicker?: string;
}

const INK = "#1A2350";

/** Onest 500/700 from public/fonts/og (the Docker image ships public/ next to server.js). */
async function fonts() {
  const dir = path.join(process.cwd(), "public", "fonts", "og");
  const load = (f: string) => readFile(path.join(dir, f));
  const [c7, l7, c5, l5] = await Promise.all([
    load("onest-cyrillic-700-normal.woff"),
    load("onest-latin-700-normal.woff"),
    load("onest-cyrillic-500-normal.woff"),
    load("onest-latin-500-normal.woff"),
  ]);
  return [
    { name: "OnestCyr", data: c7, weight: 700 as const, style: "normal" as const },
    { name: "Onest", data: l7, weight: 700 as const, style: "normal" as const },
    { name: "OnestCyr", data: c5, weight: 500 as const, style: "normal" as const },
    { name: "Onest", data: l5, weight: 500 as const, style: "normal" as const },
  ];
}

/** The logo mark (same drawing as components/shell/Logo.tsx). */
function Mark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7AA5FF" />
          <stop offset=".55" stopColor="#3A6DF0" />
          <stop offset="1" stopColor="#6A4FE8" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="14" fill="url(#lg)" />
      <path
        d="M24 9.5c8.8 0 15.5 6 15.5 13.8S32.8 37 24 37c-1.6 0-3.1-.2-4.6-.6l-6.2 4.1c-.8.5-1.7-.3-1.4-1.1l1.8-5.3C10.5 31.8 8.5 27.8 8.5 23.3 8.5 15.5 15.2 9.5 24 9.5Z"
        fill="#fff"
      />
      <circle cx="15.4" cy="26.6" r="2.7" fill="#FFB08A" opacity=".85" />
      <circle cx="32.6" cy="26.6" r="2.7" fill="#FFB08A" opacity=".85" />
      <path
        d="M16.6 21.8c1.2-1.9 3.6-1.9 4.8 0M26.6 21.8c1.2-1.9 3.6-1.9 4.8 0M20.2 27.2c2.2 2.3 5.4 2.3 7.6 0"
        stroke={INK}
        strokeWidth={2.4}
        strokeLinecap="round"
      />
      <path d="M38.5 5.5l1.1 2.9 2.9 1.1-2.9 1.1-1.1 2.9-1.1-2.9-2.9-1.1 2.9-1.1Z" fill="#FFE17C" />
    </svg>
  );
}

/** A four-point sparkle (plain function: satori serialises <svg> children as-is, no components). */
const spark = (x: number, y: number, k: number, fill = "#FFE17C") => (
  <path
    d={`M${x} ${y - k}l${k * 0.28} ${k * 0.72} ${k * 0.72} ${k * 0.28}-${k * 0.72} ${k * 0.28}-${k * 0.28} ${k * 0.72}-${k * 0.28}-${k * 0.72}-${k * 0.72}-${k * 0.28} ${k * 0.72}-${k * 0.28}Z`}
    fill={fill}
  />
);

/** Small flat illustrations in the logo palette (320×320 viewBox). */
function Art({ art }: { art: OgArt }) {
  const g = (
    <defs>
      <linearGradient id="gBlue" x1="0.15" y1="0" x2="0.85" y2="1">
        <stop offset="0" stopColor="#8DB5FF" />
        <stop offset="1" stopColor="#3A6DF0" />
      </linearGradient>
      <linearGradient id="gBrand" x1="0.15" y1="0" x2="0.85" y2="1">
        <stop offset="0" stopColor="#7AA5FF" />
        <stop offset="1" stopColor="#6A4FE8" />
      </linearGradient>
      <linearGradient id="gYellow" x1="0.15" y1="0" x2="0.85" y2="1">
        <stop offset="0" stopColor="#FFE89A" />
        <stop offset="1" stopColor="#F6BF3F" />
      </linearGradient>
      <linearGradient id="gCoral" x1="0.15" y1="0" x2="0.85" y2="1">
        <stop offset="0" stopColor="#FFB199" />
        <stop offset="1" stopColor="#F0705B" />
      </linearGradient>
      <linearGradient id="gMint" x1="0.15" y1="0" x2="0.85" y2="1">
        <stop offset="0" stopColor="#C4F3E3" />
        <stop offset="1" stopColor="#55C9A6" />
      </linearGradient>
      <linearGradient id="gCyan" x1="0.15" y1="0" x2="0.85" y2="1">
        <stop offset="0" stopColor="#A6F1F4" />
        <stop offset="1" stopColor="#3FC3D8" />
      </linearGradient>
      <linearGradient id="gLilac" x1="0.15" y1="0" x2="0.85" y2="1">
        <stop offset="0" stopColor="#E2D8FF" />
        <stop offset="1" stopColor="#A68CFF" />
      </linearGradient>
      <linearGradient id="gWhite" x1="0.15" y1="0" x2="0.85" y2="1">
        <stop offset="0" stopColor="#FFFFFF" />
        <stop offset="1" stopColor="#E7EBFA" />
      </linearGradient>
      <radialGradient id="gHalo" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor="#7AA5FF" stopOpacity="0.38" />
        <stop offset="1" stopColor="#7AA5FF" stopOpacity="0" />
      </radialGradient>
    </defs>
  );
  const face = (cx: number, cy: number, k = 1) => (
    <g>
      <circle cx={cx - 24 * k} cy={cy + 10 * k} r={7 * k} fill="#FFB08A" opacity=".85" />
      <circle cx={cx + 24 * k} cy={cy + 10 * k} r={7 * k} fill="#FFB08A" opacity=".85" />
      <path
        d={`M${cx - 22 * k} ${cy - 4 * k}c${3 * k}-${5 * k} ${9 * k}-${5 * k} ${12 * k} 0M${cx + 10 * k} ${cy - 4 * k}c${3 * k}-${5 * k} ${9 * k}-${5 * k} ${12 * k} 0M${cx - 10 * k} ${cy + 10 * k}c${5.5 * k} ${6 * k} ${14.5 * k} ${6 * k} ${20 * k} 0`}
        stroke={INK}
        strokeWidth={6 * k}
        strokeLinecap="round"
        fill="none"
      />
    </g>
  );
  let body: JSX.Element;
  switch (art) {
    case "bubble": // anonymity: a speech-bubble face instead of your face
      body = (
        <g>
          <path
            d="M160 58c58 0 102 39 102 90s-44 90-102 90c-11 0-21-1-30-4l-40 27c-6 4-12-2-10-8l12-35C66 205 58 178 58 148c0-51 44-90 102-90Z"
            fill="url(#gWhite)"
          />
          {face(160, 146, 1.5)}
          <rect x="214" y="200" width="78" height="52" rx="26" fill="url(#gCyan)" />
          <circle cx="236" cy="226" r="6" fill="#fff" />
          <circle cx="253" cy="226" r="6" fill="#fff" />
          <circle cx="270" cy="226" r="6" fill="#fff" />
          {spark(262, 62, 26)}
          {spark(52, 96, 14, "#FFB199")}
        </g>
      );
      break;
    case "book":
      body = (
        <g>
          <path d="M160 96c-30-18-70-22-104-14v150c34-8 74-4 104 14Z" fill="url(#gWhite)" />
          <path d="M160 96c30-18 70-22 104-14v150c-34-8-74-4-104 14Z" fill="url(#gLilac)" />
          <path d="M160 96v150" stroke="#C7CEEA" strokeWidth="4" />
          <path d="M80 120c20-4 44-2 62 6M80 146c20-4 44-2 62 6M80 172c20-4 44-2 62 6" stroke="#A9B4DA" strokeWidth="7" strokeLinecap="round" />
          <path d="M180 126c18-8 42-10 62-6M180 152c18-8 42-10 62-6" stroke="#fff" strokeOpacity=".75" strokeWidth="7" strokeLinecap="round" />
          <path d="M248 58c-26 6-40 26-36 52 26-4 42-24 36-52Z" fill="url(#gMint)" />
          <path d="M214 108c8-16 18-28 30-40" stroke="#35A386" strokeWidth="4" strokeLinecap="round" />
          {spark(70, 70, 22)}
        </g>
      );
      break;
    case "breath": // practices: slow rings, a leaf
      body = (
        <g>
          <circle cx="160" cy="166" r="118" fill="url(#gHalo)" />
          <circle cx="160" cy="166" r="92" fill="none" stroke="#A6F1F4" strokeOpacity=".45" strokeWidth="10" />
          <circle cx="160" cy="166" r="62" fill="url(#gMint)" />
          <path d="M160 206c-30-12-40-40-26-70 30 10 40 40 26 70Z" fill="#fff" fillOpacity=".92" />
          <path d="M160 206c-6-20-12-40-24-62" stroke="#55C9A6" strokeWidth="4" strokeLinecap="round" />
          <path d="M40 92c26-10 50-10 72 0M212 262c26-10 50-10 72 0" stroke="#A6F1F4" strokeOpacity=".7" strokeWidth="8" strokeLinecap="round" fill="none" />
          {spark(258, 74, 22)}
        </g>
      );
      break;
    case "chat": // specialists / dialogues
      body = (
        <g>
          <path d="M56 88c0-17 14-30 31-30h120c17 0 31 13 31 30v62c0 17-14 30-31 30h-70l-40 30c-5 4-12 0-10-6l6-24h-6c-17 0-31-13-31-30Z" fill="url(#gBlue)" />
          <path d="M92 104h110M92 132h72" stroke="#fff" strokeOpacity=".85" strokeWidth="10" strokeLinecap="round" />
          <path d="M126 204c0-15 12-26 27-26h96c15 0 27 11 27 26v46c0 15-12 26-27 26h-6l5 20c2 6-5 10-10 6l-34-26h-51c-15 0-27-11-27-26Z" fill="url(#gWhite)" />
          <path d="M201 246c-9-7-22-15-22-27 0-7 5-12 11-12 5 0 9 3 11 7 2-4 6-7 11-7 6 0 11 5 11 12 0 12-13 20-22 27Z" fill="url(#gCoral)" />
          {spark(270, 72, 24)}
        </g>
      );
      break;
    case "key":
      body = (
        <g>
          <circle cx="122" cy="132" r="66" fill="url(#gYellow)" />
          <circle cx="122" cy="132" r="24" fill="#1B1F3F" />
          <path d="M168 176l96 96" stroke="url(#gYellow)" strokeWidth="30" strokeLinecap="round" />
          <path d="M232 240l22-22M256 264l18-18" stroke="#F6BF3F" strokeWidth="22" strokeLinecap="round" />
          {spark(250, 80, 26)}
          {spark(60, 250, 14, "#A6F1F4")}
        </g>
      );
      break;
    case "badge": // for specialists: a profile card with a check
      body = (
        <g>
          <rect x="64" y="64" width="192" height="210" rx="30" fill="url(#gWhite)" />
          <circle cx="160" cy="138" r="40" fill="url(#gCoral)" />
          <path d="M120 206h80M134 232h52" stroke="#C7CEEA" strokeWidth="12" strokeLinecap="round" />
          <circle cx="238" cy="252" r="38" fill="url(#gMint)" />
          <path d="M221 252l12 12 22-24" stroke="#fff" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          {spark(74, 60, 22)}
        </g>
      );
      break;
    case "doc": // legal
      body = (
        <g>
          <rect x="70" y="54" width="170" height="216" rx="26" fill="url(#gWhite)" />
          <path d="M104 106h100M104 136h100M104 166h64" stroke="#C7CEEA" strokeWidth="11" strokeLinecap="round" />
          <path d="M226 170l54 20v38c0 34-24 54-54 64-30-10-54-30-54-64v-38Z" fill="url(#gBrand)" />
          <path d="M206 228l14 14 26-28" stroke="#fff" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          {spark(64, 262, 16)}
        </g>
      );
      break;
    case "lock":
    default:
      body = (
        <g>
          <path d="M112 146v-26c0-27 21-48 48-48s48 21 48 48v26" stroke="#A9B4DA" strokeWidth="20" fill="none" strokeLinecap="round" />
          <rect x="82" y="138" width="156" height="132" rx="30" fill="url(#gBrand)" />
          {face(160, 196, 1.1)}
          {spark(258, 84, 24)}
        </g>
      );
  }
  return (
    <svg width={300} height={300} viewBox="0 0 320 320">
      {g}
      {body}
    </svg>
  );
}

export async function ogCard({ title, subtitle, art, kicker }: OgCardProps) {
  const titleSize = title.length > 40 ? 52 : title.length > 15 ? 64 : 78;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          fontFamily: "Onest, OnestCyr",
          color: "#F4F6FF",
          background: "linear-gradient(135deg, #141A3A 0%, #10132B 55%, #1C1540 100%)",
        }}
      >
        {/* soft light in the logo colours */}
        <div
          style={{
            position: "absolute",
            left: -160,
            top: -220,
            width: 720,
            height: 620,
            borderRadius: 9999,
            background: "radial-gradient(closest-side, rgba(122,165,255,0.30), rgba(122,165,255,0))",
          }}
        />
        <div
          style={{
            position: "absolute",
            right: -120,
            bottom: -260,
            width: 760,
            height: 680,
            borderRadius: 9999,
            background: "radial-gradient(closest-side, rgba(106,79,232,0.38), rgba(106,79,232,0))",
          }}
        />
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "64px 0 60px 76px", width: 800 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <Mark size={64} />
            <span style={{ fontSize: 38, fontWeight: 700, letterSpacing: -0.5 }}>aprosop</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {kicker && (
              <span style={{ fontSize: 26, fontWeight: 500, color: "#9FB4FF", textTransform: "uppercase", letterSpacing: 2 }}>{kicker}</span>
            )}
            <span style={{ fontSize: titleSize, fontWeight: 700, lineHeight: 1.06, letterSpacing: -1.5 }}>{title}</span>
            <span style={{ fontSize: 28, fontWeight: 500, lineHeight: 1.3, color: "#C3CBEA" }}>{subtitle}</span>
          </div>
          <span style={{ fontSize: 24, fontWeight: 500, color: "#8990B5" }}>aprosop.ru</span>
        </div>
        <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center", paddingRight: 40 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 340,
              height: 340,
              borderRadius: 9999,
              background: "linear-gradient(145deg, rgba(255,255,255,0.10), rgba(255,255,255,0.03))",
              border: "2px solid rgba(255,255,255,0.08)",
            }}
          >
            <Art art={art} />
          </div>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts: await fonts() },
  );
}
