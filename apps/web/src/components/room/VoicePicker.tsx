"use client";

import { AudioLines, Bot, Mic, MoveDown, MoveUp, Sparkles } from "lucide-react";
import { VOICE_PRESETS, type VoicePreset } from "@/hooks/useVoiceTransform";
import s from "./Room.module.css";

const ICONS: Record<VoicePreset, React.ReactNode> = {
  off: <Mic size={18} />,
  lower: <MoveDown size={18} />,
  higher: <MoveUp size={18} />,
  soft: <Sparkles size={18} />,
  neutral: <AudioLines size={18} />,
  robot: <Bot size={18} />,
};

/** Voice filter choice: a radio list with a one-line explanation per preset. */
export function VoicePicker({ value, onChange, compact }: { value: VoicePreset; onChange: (v: VoicePreset) => void; compact?: boolean }) {
  return (
    <div className={`${s.voices} ${compact ? s.voicesCompact : ""}`} role="radiogroup" aria-label="Фильтр голоса">
      {VOICE_PRESETS.map((p) => (
        <button
          key={p.value}
          type="button"
          role="radio"
          aria-checked={value === p.value}
          className={s.voice}
          onClick={() => onChange(p.value)}
        >
          <span className={s.voiceIcon}>{ICONS[p.value]}</span>
          <span className={s.voiceText}>
            <span className={s.voiceName}>{p.label}</span>
            {!compact && <span className={s.voiceHint}>{p.hint}</span>}
          </span>
        </button>
      ))}
    </div>
  );
}

export function loadVoice(): VoicePreset {
  try {
    const v = localStorage.getItem("aprosop.callVoice") as VoicePreset | null;
    return v && VOICE_PRESETS.some((p) => p.value === v) ? v : "off";
  } catch {
    return "off";
  }
}
export function saveVoice(v: VoicePreset) {
  try {
    localStorage.setItem("aprosop.callVoice", v);
  } catch {
    /* ignore */
  }
}
