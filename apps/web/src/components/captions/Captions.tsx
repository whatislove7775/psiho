"use client";

/**
 * Live-captions UI shared by 1:1 calls (components/room/Room.tsx) and «Круги»:
 *  - <CaptionOverlay>  two fading lines over the video, with a speaker label;
 *  - <CaptionsPanel>   toggles («Субтитры», «Только текст») + the transcript;
 *  - <TextOnlyBadge>   "Клиент общается текстом" for both sides.
 * The data comes from lib/captions/useCaptions.
 */
import { t as tt } from "@/lib/i18n";
import { useEffect, useRef, useState } from "react";
import { Check, Copy, Keyboard } from "lucide-react";
import type { CaptionLine, CaptionLog } from "@/lib/captions/protocol";
import type { SttLoad } from "@/lib/captions/engine";
import s from "./captions.module.css";

export type SpeakerLabel = (who: string) => string;

/** Re-render once a second while something is on screen, so old lines fade out. */
function useClock(active: boolean) {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(performance.now()), 500);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

export function CaptionOverlay({
  log,
  version,
  label,
  include,
  lifted,
  badge,
}: {
  log: CaptionLog;
  /** bumps whenever the log changes */
  version: number;
  label: SpeakerLabel;
  /** which speakers to show */
  include: (who: string) => boolean;
  /** controls are visible → sit above them */
  lifted?: boolean;
  /** shown above the lines, e.g. <TextOnlyBadge> */
  badge?: React.ReactNode;
}) {
  const now = useClock(log.all().length > 0);
  // version is only a change signal; recompute on every render
  void version;
  const lines: CaptionLine[] = log.recent(Math.max(now, performance.now()), { windowMs: 6000, max: 2, who: include });
  if (!lines.length && !badge) return null;
  return (
    <div className={`${s.overlay} ${lifted ? s.lifted : ""}`}>
      {badge}
      <div className={s.lines} aria-live="polite" aria-atomic="false" data-testid="captions">
        {lines.map((l) => (
        <p key={`${l.who}:${l.seg}`} className={s.line} data-final={l.final ? "1" : "0"}>
          <span className={s.who}>{label(l.who)}</span>
          <span className={s.text}>{l.text}</span>
        </p>
        ))}
      </div>
    </div>
  );
}

export function TextOnlyBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className={s.badge} role="status">
      <Keyboard size={14} />
      {children}
    </span>
  );
}

function Switch({ on, onChange, label, hint, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} className={s.switchRow} onClick={() => onChange(!on)} disabled={disabled}>
      <span className={s.switchText}>
        <span className={s.switchLabel}>{label}</span>
        {hint && <span className={s.switchHint}>{hint}</span>}
      </span>
      <span className={s.switch} aria-hidden />
    </button>
  );
}

export function CaptionsPanel({
  show,
  onShow,
  textOnly,
  onTextOnly,
  textOnlyHint,
  load,
  peerNote,
  log,
  version,
  label,
  onCopy,
}: {
  show: boolean;
  onShow: (v: boolean) => void;
  /** only for the side that may speak via text (the client, circle members) */
  textOnly?: boolean;
  onTextOnly?: (v: boolean) => void;
  textOnlyHint?: string;
  load: SttLoad;
  /** e.g. "У специалиста распознавание недоступно" */
  peerNote?: string | null;
  log: CaptionLog;
  version: number;
  label: SpeakerLabel;
  onCopy: () => Promise<boolean>;
}) {
  const [copied, setCopied] = useState(false);
  const listRef = useRef<HTMLOListElement>(null);
  const lines = log.all();
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [version]);
  const copy = async () => {
    if (await onCopy()) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };
  return (
    <div className={s.panel}>
      <div className={s.group}>
        <Switch on={show} onChange={onShow} label={tt("Показывать субтитры")} hint={tt("Речь собеседника текстом. Можно выключить звук и\u00a0читать.")} />
        {onTextOnly && (
          <Switch on={!!textOnly} onChange={onTextOnly} label={tt("Только текст")} hint={textOnlyHint} />
        )}
      </div>
      {load === "loading" && <p className={s.status}>{tt("Загружаем распознавание речи. Один раз, около 45\u00a0МБ…")}</p>}
      {load === "error" && <p className={s.status}>{tt("Не\u00a0получилось загрузить распознавание речи.")}</p>}
      {peerNote && <p className={s.status}>{peerNote}</p>}

      <div className={s.transcriptHead}>
        <span className={s.transcriptTitle}>{tt("Расшифровка")}</span>
        {lines.length > 0 && (
          <button type="button" className={s.copy} onClick={copy}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? tt("Скопировано") : tt("Скопировать")}
          </button>
        )}
      </div>
      {lines.length ? (
        <ol className={s.transcript} ref={listRef}>
          {lines.map((l) => (
            <li key={`${l.who}:${l.seg}`} className={s.tItem} data-final={l.final ? "1" : "0"}>
              <span className={s.tWho}>{label(l.who)}</span>
              {l.text}
            </li>
          ))}
        </ol>
      ) : (
        <p className={s.empty}>{tt("Здесь появится текст разговора. Он\u00a0не\u00a0сохраняется и\u00a0исчезнет после звонка.")}</p>
      )}
      <p className={s.privacy}>
        {tt("Речь распознаётся на\u00a0устройстве того, кто говорит. Текст идёт напрямую собеседнику, мимо наших серверов.")}
      </p>
    </div>
  );
}
