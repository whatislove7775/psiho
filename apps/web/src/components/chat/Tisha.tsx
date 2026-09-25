"use client";

import { useId } from "react";
import s from "./tisha.module.css";

export type TishaState = "idle" | "typing" | "sleep";

/**
 * «Тиша» — талисман ИИ-помощника: мягкое круглое существо с ушками-лепестками
 * и ростком на макушке. Оригинальная SVG-иллюстрация, три состояния:
 * idle — дышит и моргает, typing — задумчиво покачивается и смотрит вверх,
 * sleep — дремлет (когда помощник ещё не подключён).
 */
export function Tisha({ size = 96, state = "idle", className }: { size?: number; state?: TishaState; className?: string }) {
  const uid = useId().replace(/:/g, "");
  const body = `tb-${uid}`;
  const belly = `tl-${uid}`;
  const leaf = `tf-${uid}`;
  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      className={[s.root, s[state], className].filter(Boolean).join(" ")}
      role="img"
      aria-label="Тиша, ИИ-помощник"
    >
      <defs>
        <radialGradient id={body} cx="38%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#E9E3FF" />
          <stop offset="55%" stopColor="#C4B6FF" />
          <stop offset="100%" stopColor="#9C8AF0" />
        </radialGradient>
        <radialGradient id={belly} cx="50%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#F1EDFF" stopOpacity="0.6" />
        </radialGradient>
        <linearGradient id={leaf} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#C9F5E9" />
          <stop offset="100%" stopColor="#6FD3BC" />
        </linearGradient>
      </defs>

      <ellipse className={s.shadow} cx="60" cy="110" rx="30" ry="4.5" />

      <g className={s.bodyGroup}>
        {/* росток */}
        <g className={s.sprout}>
          <path d="M60 24 C60 18 60 14 61 10" stroke="#5CC2AA" strokeWidth="2.6" strokeLinecap="round" fill="none" />
          <path d="M61 12 C66 4 76 5 78 9 C72 14 66 15 61 12 Z" fill={`url(#${leaf})`} />
          <path d="M60 15 C55 9 47 10 46 14 C51 18 56 18 60 15 Z" fill={`url(#${leaf})`} opacity="0.9" />
        </g>
        {/* ушки-лепестки */}
        <path d="M30 40 C22 30 22 20 30 18 C38 18 42 28 42 34 Z" fill="#B3A3FA" />
        <path d="M90 40 C98 30 98 20 90 18 C82 18 78 28 78 34 Z" fill="#B3A3FA" />
        <path d="M32 34 C28 28 29 23 32 22 C36 23 38 28 38 32 Z" fill="#FFD3E1" opacity="0.75" />
        <path d="M88 34 C92 28 91 23 88 22 C84 23 82 28 82 32 Z" fill="#FFD3E1" opacity="0.75" />
        {/* тело */}
        <path
          d="M60 22 C86 22 100 42 100 66 C100 90 84 106 60 106 C36 106 20 90 20 66 C20 42 34 22 60 22 Z"
          fill={`url(#${body})`}
        />
        <ellipse cx="60" cy="80" rx="24" ry="20" fill={`url(#${belly})`} />
        {/* лапки */}
        <ellipse className={s.pawL} cx="31" cy="78" rx="7" ry="9" fill="#A794F5" />
        <ellipse className={s.pawR} cx="89" cy="78" rx="7" ry="9" fill="#A794F5" />
        {/* щёчки */}
        <ellipse cx="39" cy="64" rx="7" ry="4.2" fill="#FF9DB8" opacity="0.55" />
        <ellipse cx="81" cy="64" rx="7" ry="4.2" fill="#FF9DB8" opacity="0.55" />
        {/* глаза */}
        {state === "sleep" ? (
          <g stroke="#2A2340" strokeWidth="2.6" strokeLinecap="round" fill="none">
            <path d="M42 55 Q48 60 54 55" />
            <path d="M66 55 Q72 60 78 55" />
          </g>
        ) : (
          <g className={s.eyes}>
            <g className={s.eyeL}>
              <ellipse cx="48" cy="54" rx="5.2" ry="6.4" fill="#2A2340" />
              <circle cx="49.8" cy="51.6" r="1.8" fill="#FFFFFF" />
            </g>
            <g className={s.eyeR}>
              <ellipse cx="72" cy="54" rx="5.2" ry="6.4" fill="#2A2340" />
              <circle cx="73.8" cy="51.6" r="1.8" fill="#FFFFFF" />
            </g>
          </g>
        )}
        {/* ротик */}
        {state === "typing" ? (
          <ellipse cx="60" cy="67" rx="3" ry="2.4" fill="#2A2340" />
        ) : (
          <path d="M54 65 Q60 70.5 66 65" stroke="#2A2340" strokeWidth="2.4" strokeLinecap="round" fill="none" />
        )}
      </g>

      {state === "sleep" && (
        <g className={s.zzz} fill="currentColor">
          <text x="92" y="30" fontSize="11" fontWeight="700">z</text>
          <text x="100" y="20" fontSize="8" fontWeight="700">z</text>
        </g>
      )}
      {state === "typing" && (
        <g className={s.dots}>
          <circle cx="94" cy="26" r="3" />
          <circle cx="103" cy="26" r="3" />
          <circle cx="112" cy="26" r="3" />
        </g>
      )}
    </svg>
  );
}
