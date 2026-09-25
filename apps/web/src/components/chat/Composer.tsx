"use client";

import { Check, Mic, Paperclip, Pencil, Send, Square, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Segmented } from "@/ui";
import type { VoicePreset } from "@/hooks/useVoiceTransform";
import { fmtDuration, VoicePlayer } from "./VoicePlayer";
import { useVoiceRecorder, type VoiceClip } from "./useVoiceRecorder";
import s from "./chat.module.css";

const MASKS: { value: VoicePreset; label: string }[] = [
  { value: "off", label: "Без маски" },
  { value: "lower", label: "Ниже" },
  { value: "higher", label: "Выше" },
];

export const FILE_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.pptx,.odt,.rtf,.txt,.png,.jpg,.jpeg,.webp,.gif,.mp3";

export function Composer({
  onSendText,
  onSendVoice,
  onSendFile,
  onTyping,
  allowVoice = true,
  allowFiles = false,
  disabled,
  placeholder = "Сообщение",
  editing,
  onCancelEdit,
  busy,
}: {
  onSendText: (text: string) => Promise<boolean | void> | boolean | void;
  onSendVoice?: (clip: VoiceClip) => Promise<boolean | void>;
  onSendFile?: (file: File) => void;
  onTyping?: () => void;
  allowVoice?: boolean;
  allowFiles?: boolean;
  disabled?: boolean;
  placeholder?: string;
  editing?: { id: string; text: string } | null;
  onCancelEdit?: () => void;
  busy?: boolean;
}) {
  const [text, setText] = useState("");
  const [sendingVoice, setSendingVoice] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const rec = useVoiceRecorder();

  useEffect(() => {
    if (editing) {
      setText(editing.text);
      requestAnimationFrame(() => area.current?.focus());
    }
  }, [editing]);

  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(160, el.scrollHeight)}px`;
  }, [text]);

  const submit = async () => {
    const value = text.trim();
    if (!value || disabled || busy) return;
    const res = await onSendText(value);
    if (res !== false) setText("");
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const coarse = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
    if (e.key === "Enter" && !e.shiftKey && !coarse && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit();
    }
    if (e.key === "Escape" && editing) {
      onCancelEdit?.();
      setText("");
    }
  };

  const sendClip = async () => {
    if (!rec.clip || !onSendVoice) return;
    setSendingVoice(true);
    const ok = await onSendVoice(rec.clip);
    setSendingVoice(false);
    if (ok !== false) rec.reset();
  };

  // ── Voice recorder panel ────────────────────────────────────────────────
  if (rec.phase !== "idle") {
    return (
      <div className={s.composer}>
        <div className={s.recorder}>
          {rec.phase === "error" ? (
            <div className={s.recRow}>
              <span className={s.recError}>{rec.error}</span>
              <button type="button" className={s.iconBtn} onClick={rec.reset} aria-label="Закрыть">
                <X size={20} />
              </button>
            </div>
          ) : rec.phase === "review" && rec.clip ? (
            <div className={s.recRow}>
              <button type="button" className={s.iconBtn} onClick={rec.reset} aria-label="Удалить запись">
                <Trash2 size={20} />
              </button>
              <div className={s.recPreview}>
                <VoicePlayer src={rec.clip.url} peaks={rec.clip.peaks} durationMs={rec.clip.durationMs} tone="plain" />
              </div>
              <button
                type="button"
                className={s.sendBtn}
                onClick={sendClip}
                disabled={sendingVoice}
                aria-label="Отправить голосовое"
              >
                {sendingVoice ? <span className={s.miniSpin} /> : <Send size={20} />}
              </button>
            </div>
          ) : (
            <>
              <div className={s.recMask}>
                <span className={s.recMaskLabel}>Маска голоса</span>
                {rec.phase === "recording" ? (
                  <span className={s.recMaskValue}>{MASKS.find((m) => m.value === rec.preset)?.label}</span>
                ) : (
                  <Segmented value={rec.preset} onChange={rec.setPreset} options={MASKS} ariaLabel="Маска голоса" />
                )}
              </div>
              <div className={s.recRow}>
                <button type="button" className={s.iconBtn} onClick={rec.reset} aria-label="Отменить запись">
                  <Trash2 size={20} />
                </button>
                <div className={s.recLive}>
                  {rec.phase === "recording" ? (
                    <>
                      <span className={s.recDot} aria-hidden />
                      <span className={s.recTime}>{fmtDuration(rec.elapsed)}</span>
                      <span className={s.liveBars} aria-hidden>
                        {Array.from({ length: 40 }, (_, i) => {
                          const v = rec.live[rec.live.length - 40 + i] ?? 0;
                          return <span key={i} style={{ height: `${Math.round(10 + v * 90)}%` }} />;
                        })}
                      </span>
                    </>
                  ) : (
                    <span className={s.recHint}>
                      {rec.phase === "opening"
                        ? "Включаем микрофон…"
                        : rec.preset === "off"
                          ? "Голос будет записан как есть"
                          : "Голос изменится ещё на вашем устройстве — оригинал никуда не уходит"}
                    </span>
                  )}
                </div>
                {rec.phase === "recording" ? (
                  <button type="button" className={s.stopBtn} onClick={rec.stop} aria-label="Остановить запись">
                    <Square size={16} fill="currentColor" />
                  </button>
                ) : (
                  <button
                    type="button"
                    className={s.recBtn}
                    onClick={rec.start}
                    disabled={rec.phase !== "ready" || !rec.ready}
                    aria-label="Начать запись"
                  >
                    <Mic size={20} />
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  const hasText = text.trim().length > 0;
  return (
    <div className={s.composer}>
      {editing && (
        <div className={s.editBar}>
          <Pencil size={16} />
          <span>Редактирование сообщения</span>
          <button
            type="button"
            className={s.iconBtnSm}
            onClick={() => {
              onCancelEdit?.();
              setText("");
            }}
            aria-label="Отменить редактирование"
          >
            <X size={16} />
          </button>
        </div>
      )}
      <div className={s.composerRow}>
        {allowFiles && !editing && (
          <>
            <button
              type="button"
              className={s.iconBtn}
              onClick={() => fileInput.current?.click()}
              aria-label="Прикрепить файл"
              disabled={disabled}
            >
              <Paperclip size={20} />
            </button>
            <input
              ref={fileInput}
              type="file"
              hidden
              accept={FILE_ACCEPT}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onSendFile?.(f);
                e.target.value = "";
              }}
            />
          </>
        )}
        <textarea
          ref={area}
          className={s.textarea}
          rows={1}
          value={text}
          placeholder={placeholder}
          maxLength={4000}
          disabled={disabled}
          onChange={(e) => {
            setText(e.target.value);
            onTyping?.();
          }}
          onKeyDown={onKey}
          aria-label="Текст сообщения"
        />
        {hasText || editing || !allowVoice ? (
          <button
            type="button"
            className={s.sendBtn}
            onClick={submit}
            disabled={!hasText || disabled || busy}
            aria-label={editing ? "Сохранить" : "Отправить"}
          >
            {busy ? <span className={s.miniSpin} /> : editing ? <Check size={20} /> : <Send size={20} />}
          </button>
        ) : (
          <button type="button" className={s.micBtn} onClick={rec.open} disabled={disabled} aria-label="Записать голосовое">
            <Mic size={20} />
          </button>
        )}
      </div>
    </div>
  );
}
