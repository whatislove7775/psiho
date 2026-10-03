"use client";

import { t } from "@/lib/i18n";
import { Check, Mic, Paperclip, Pencil, Send, ShieldAlert, Square, Trash2, X } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { describeContacts, findContacts, type ContactHit } from "@/lib/chat/contacts";
import { Segmented } from "@/ui";
import { MI, Morph } from "@/components/ui/Morph";
import type { VoicePreset } from "@/hooks/useVoiceTransform";
import { fmtDuration, VoicePlayer } from "./VoicePlayer";
import { useVoiceRecorder, type VoiceClip } from "./useVoiceRecorder";
import { AttachSheet, type FileSendOptions } from "./AttachSheet";
import { VoiceTextToggle } from "@/components/captions/VoiceTranscript";
import s from "./chat.module.css";

const MASKS: { value: VoicePreset; label: string }[] = [
  { value: "off", get label() { return t("Без\u00a0маски"); } },
  { value: "lower", get label() { return t("Ниже"); } },
  { value: "higher", get label() { return t("Выше"); } },
];

export const FILE_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.pptx,.odt,.rtf,.txt,.png,.jpg,.jpeg,.webp,.gif,.mp3";

export function Composer({
  onSendText,
  onSendVoice,
  onSendFile,
  onTyping,
  allowVoice = true,
  allowFiles = false,
  filesHint,
  guardContacts = false,
  blockedMessage,
  onBlockedClear,
  disabled,
  placeholder = t("Сообщение"),
  editing,
  onCancelEdit,
  busy,
}: {
  onSendText: (text: string) => Promise<boolean | void> | boolean | void;
  onSendVoice?: (clip: VoiceClip) => Promise<boolean | void>;
  /** called from the attach sheet (preview, caption, view-once, disappear timer) */
  onSendFile?: (file: File, opts: FileSendOptions) => Promise<boolean | void> | boolean | void;
  onTyping?: () => void;
  allowVoice?: boolean;
  allowFiles?: boolean;
  /** attach is not allowed here: show a muted paperclip with this short reason */
  filesHint?: string | null;
  /** client↔specialist before the first call: pre-check for phones, @handles, links, emails */
  guardContacts?: boolean;
  /** server rejected the last message for contacts (422) */
  blockedMessage?: string | null;
  onBlockedClear?: () => void;
  disabled?: boolean;
  placeholder?: string;
  editing?: { id: string; text: string } | null;
  onCancelEdit?: () => void;
  busy?: boolean;
}) {
  const [text, setText] = useState("");
  const [sendingVoice, setSendingVoice] = useState(false);
  const [tipOpen, setTipOpen] = useState(false);
  const hits = useMemo(() => (guardContacts ? findContacts(text) : []), [guardContacts, text]);
  const blocked = hits.length > 0;
  const area = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<File | null>(null);
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
    if (!value || disabled || busy || blocked) return;
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
              <button type="button" className={s.iconBtn} onClick={rec.reset} aria-label={t("Закрыть")}>
                <X size={20} />
              </button>
            </div>
          ) : rec.phase === "review" && rec.clip ? (
            <div className={s.recRow}>
              <button type="button" className={s.iconBtn} onClick={rec.reset} aria-label={t("Удалить запись")}>
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
                aria-label={t("Отправить голосовое")}
              >
                {sendingVoice ? <span className={s.miniSpin} /> : <Send size={20} />}
              </button>
            </div>
          ) : (
            <>
              <div className={s.recMask}>
                <span className={s.recMaskLabel}>{t("Маска голоса")}</span>
                {rec.phase === "recording" ? (
                  <span className={s.recMaskValue}>{MASKS.find((m) => m.value === rec.preset)?.label}</span>
                ) : (
                  <Segmented value={rec.preset} onChange={rec.setPreset} options={MASKS} ariaLabel={t("Маска голоса")} />
                )}
                {rec.withText !== null && rec.phase !== "recording" && <VoiceTextToggle on={rec.withText} onChange={rec.setWithText} />}
              </div>
              <div className={s.recRow}>
                <button type="button" className={s.iconBtn} onClick={rec.reset} aria-label={t("Отменить запись")}>
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
                        ? t("Включаем микрофон…")
                        : rec.preset === "off"
                          ? t("Голос будет записан как\u00a0есть")
                          : t("Голос изменится ещё на\u00a0вашем устройстве\u00a0— оригинал никуда не\u00a0уходит")}
                    </span>
                  )}
                </div>
                {rec.phase === "recording" ? (
                  <button type="button" className={s.stopBtn} onClick={rec.stop} aria-label={t("Остановить запись")}>
                    <Square size={16} fill="currentColor" />
                  </button>
                ) : (
                  <button
                    type="button"
                    className={s.recBtn}
                    onClick={rec.start}
                    disabled={rec.phase !== "ready" || !rec.ready}
                    aria-label={t("Начать запись")}
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
  const blockText = blocked
    ? t(`До\u00a0первого созвона нельзя делиться контактами\u00a0— уберите {describeContacts}.`, { describeContacts: describeContacts(hits) })
    : blockedMessage;
  return (
    <div className={s.composer}>
      {blockText && (
        <div className={s.blockNote} role="alert">
          <ShieldAlert size={15} aria-hidden />
          <span>
            {blockText}
            {blocked && <Excerpt text={text} hits={hits} />}
          </span>
        </div>
      )}
      {editing && (
        <div className={s.editBar}>
          <Pencil size={16} />
          <span>{t("Редактирование сообщения")}</span>
          <button
            type="button"
            className={s.iconBtnSm}
            onClick={() => {
              onCancelEdit?.();
              setText("");
            }}
            aria-label={t("Отменить редактирование")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      <div className={s.composerRow}>
        {!allowFiles && filesHint && !editing && (
          <span className={s.attachTipWrap}>
            <button
              type="button"
              className={`${s.iconBtn} ${s.attachOff}`}
              aria-disabled="true"
              aria-label={t(`Прикрепить файл: {filesHint}`, { filesHint })}
              onClick={() => {
                setTipOpen(true);
                window.setTimeout(() => setTipOpen(false), 2600);
              }}
              onBlur={() => setTipOpen(false)}
            >
              <Paperclip size={20} />
            </button>
            <span className={s.attachTip} role="tooltip" data-open={tipOpen || undefined}>
              {filesHint}
            </span>
          </span>
        )}
        {allowFiles && !editing && (
          <>
            <button
              type="button"
              className={s.iconBtn}
              onClick={() => fileInput.current?.click()}
              aria-label={t("Прикрепить файл")}
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
                if (f) setPicked(f);
                e.target.value = "";
              }}
            />
            <AttachSheet file={picked} onClose={() => setPicked(null)} onSend={(f, o) => onSendFile?.(f, o)} />
          </>
        )}
        <textarea
          ref={area}
          className={`${s.textarea} ${blocked || blockedMessage ? s.textareaBlocked : ""}`}
          aria-invalid={blocked || !!blockedMessage || undefined}
          rows={1}
          value={text}
          placeholder={placeholder}
          maxLength={4000}
          disabled={disabled}
          onChange={(e) => {
            setText(e.target.value);
            if (blockedMessage) onBlockedClear?.();
            onTyping?.();
          }}
          onKeyDown={onKey}
          aria-label={t("Текст сообщения")}
        />
        {editing || !allowVoice ? (
          <button
            type="button"
            className={s.sendBtn}
            onClick={submit}
            disabled={!hasText || disabled || busy || blocked}
            aria-label={editing ? t("Сохранить") : t("Отправить")}
          >
            {busy ? <span className={s.miniSpin} /> : editing ? <Check size={20} /> : <Send size={20} />}
          </button>
        ) : (
          /* One button: the mic morphs into «send» as soon as there is text */
          <button
            type="button"
            className={`${s.sendBtn} ${s.morphBtn}`}
            data-mode={hasText ? "send" : "mic"}
            onClick={hasText ? submit : rec.open}
            disabled={hasText ? disabled || busy || blocked : disabled}
            aria-label={hasText ? t("Отправить") : t("Записать голосовое")}
          >
            {busy ? <span className={s.miniSpin} /> : <Morph icon={hasText ? MI.Send : MI.Mic} size={20} />}
          </button>
        )}
      </div>
    </div>
  );
}

/** A short excerpt around the offending fragments, each one highlighted. */
function Excerpt({ text, hits }: { text: string; hits: ContactHit[] }) {
  const from = Math.max(0, hits[0].start - 16);
  const to = Math.min(text.length, hits[hits.length - 1].end + 16);
  const parts: React.ReactNode[] = [];
  let pos = from;
  hits.forEach((h, i) => {
    if (h.start > pos) parts.push(<Fragment key={`t${i}`}>{text.slice(pos, h.start)}</Fragment>);
    parts.push(<mark key={`m${i}`}>{text.slice(h.start, h.end)}</mark>);
    pos = h.end;
  });
  if (pos < to) parts.push(<Fragment key="tail">{text.slice(pos, to)}</Fragment>);
  return (
    <span className={s.blockExcerpt}>
      {from > 0 && "…"}
      {parts}
      {to < text.length && "…"}
    </span>
  );
}
