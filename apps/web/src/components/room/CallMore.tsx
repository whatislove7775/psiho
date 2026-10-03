"use client";

import { t } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { Camera, Expand, Flag, Hand, ImageIcon, Mic, NotebookPen, RefreshCw, ScanFace, Shrink, Smile, Speaker, ThumbsUp, Wind } from "lucide-react";
import { Select } from "@/ui";
import { SLOW_NET_NOTE, useGesturesPref, useHandsPref, useHandsState } from "@/lib/avatar/headz/hands/prefs";
import { reactionStyles } from "@/components/reactions/Reactions";
import s from "./Room.module.css";

export interface DeviceChoice {
  videoinput: string | null;
  audioinput: string | null;
  audiooutput: string | null;
}

/** Lists cameras / mics / speakers. Labels appear once the page has camera permission. */
export function useDevices(active: boolean) {
  const [list, setList] = useState<MediaDeviceInfo[]>([]);
  useEffect(() => {
    if (!active || !navigator.mediaDevices?.enumerateDevices) return;
    const load = () =>
      navigator.mediaDevices
        .enumerateDevices()
        .then(setList)
        .catch(() => undefined);
    load();
    navigator.mediaDevices.addEventListener?.("devicechange", load);
    return () => navigator.mediaDevices.removeEventListener?.("devicechange", load);
  }, [active]);
  return list;
}

export const canPickSpeaker = () => typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype;

function DeviceSelect({
  icon,
  label,
  kind,
  devices,
  value,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  kind: MediaDeviceKind;
  devices: MediaDeviceInfo[];
  value: string | null;
  onChange: (id: string) => void;
}) {
  const opts = devices.filter((d) => d.kind === kind && d.deviceId);
  if (!opts.length) return null;
  return (
    <div className={s.devRow}>
      <span className={s.devIcon}>{icon}</span>
      <span className={s.devBody}>
        <span className={s.devLabel}>{label}</span>
        <Select
          size="sm"
          aria-label={label}
          className={s.select}
          value={value ?? opts[0].deviceId}
          onChange={onChange}
          options={opts.map((d, i) => ({ value: d.deviceId, label: d.label || `${label} ${i + 1}` }))}
        />
      </span>
    </div>
  );
}

export function CallMore({
  devices,
  choice,
  onDevice,
  isPro,
  fullscreen,
  onFullscreen,
  onRecalibrate,
  recalibrating,
  onBreath,
  onNotes,
  onReport,
  ambient,
  onAmbient,
  realFace,
  onRealFace,
}: {
  devices: MediaDeviceInfo[];
  choice: DeviceChoice;
  onDevice: (kind: MediaDeviceKind, id: string) => void;
  isPro: boolean;
  fullscreen: boolean;
  onFullscreen: () => void;
  onRecalibrate?: () => void;
  recalibrating?: boolean;
  onBreath: () => void;
  onNotes?: () => void;
  onReport: () => void;
  /** blurred landscape behind the call */
  ambient?: boolean;
  onAmbient?: () => void;
  /** clients only: real camera instead of the avatar (asks for confirmation first) */
  realFace?: boolean;
  onRealFace?: () => void;
}) {
  const [hands, setHands] = useHandsPref();
  const [gestures, setGestures] = useGesturesPref();
  const handsAutoOff = useHandsState().autoOff;
  return (
    <div className={s.more}>
      <div className={s.moreGroup}>
        <DeviceSelect icon={<Camera size={18} />} label={t("Камера")} kind="videoinput" devices={devices} value={choice.videoinput} onChange={(id) => onDevice("videoinput", id)} />
        <DeviceSelect icon={<Mic size={18} />} label={t("Микрофон")} kind="audioinput" devices={devices} value={choice.audioinput} onChange={(id) => onDevice("audioinput", id)} />
        {canPickSpeaker() && (
          <DeviceSelect icon={<Speaker size={18} />} label={t("Динамик")} kind="audiooutput" devices={devices} value={choice.audiooutput} onChange={(id) => onDevice("audiooutput", id)} />
        )}
      </div>
      {(onRealFace || onAmbient || !isPro) && (
        <div className={s.moreGroup}>
          {!isPro && !realFace && (
            <button type="button" className={s.moreItem} role="switch" aria-checked={hands} onClick={() => setHands(!hands)}>
              <Hand size={18} />
              <span className={s.moreGrow}>{t("Показывать руки")}</span>
              <span className={s.moreState}>{hands ? t("Вкл") : t("Выкл")}</span>
            </button>
          )}
          {!isPro && !realFace && handsAutoOff && <p className={reactionStyles.quiet}>{SLOW_NET_NOTE}</p>}
          {!isPro && !realFace && hands && (
            <button type="button" className={s.moreItem} role="switch" aria-checked={gestures} onClick={() => setGestures(!gestures)}>
              <ThumbsUp size={18} />
              <span className={s.moreGrow}>{t("Реакции жестами")}</span>
              <span className={s.moreState}>{gestures ? t("Вкл") : t("Выкл")}</span>
            </button>
          )}
          {onRealFace && (
            <button type="button" className={s.moreItem} onClick={onRealFace}>
              {realFace ? <Smile size={18} /> : <ScanFace size={18} />}
              {realFace ? t("Вернуть аватар") : t("Показать настоящее лицо")}
            </button>
          )}
          {onAmbient && (
            <button type="button" className={s.moreItem} role="switch" aria-checked={!!ambient} onClick={onAmbient}>
              <ImageIcon size={18} />
              <span className={s.moreGrow}>{t("Размытый пейзаж на\u00a0фоне")}</span>
              <span className={s.moreState}>{ambient ? t("Вкл") : t("Выкл")}</span>
            </button>
          )}
        </div>
      )}
      <div className={s.moreGroup}>
        <button type="button" className={s.moreItem} onClick={onFullscreen}>
          {fullscreen ? <Shrink size={18} /> : <Expand size={18} />}
          {fullscreen ? t("Выйти из\u00a0полноэкранного режима") : t("На\u00a0весь экран")}
        </button>
        {!isPro && onRecalibrate && (
          <button type="button" className={s.moreItem} onClick={onRecalibrate} disabled={recalibrating}>
            <RefreshCw size={18} />
            {recalibrating ? t("Запоминаем спокойное лицо…") : t("Откалибровать мимику")}
          </button>
        )}
        <button type="button" className={s.moreItem} onClick={onBreath}>
          <Wind size={18} />
          {t("Дыхательная пауза")}
        </button>
        {onNotes && (
          <button type="button" className={s.moreItem} onClick={onNotes}>
            <NotebookPen size={18} />
            {t("Заметки к\u00a0звонку")}
          </button>
        )}
        <button type="button" className={s.moreItem} onClick={onReport}>
          <Flag size={18} />
          {t("Сообщить о\u00a0проблеме со\u00a0связью")}
        </button>
      </div>
    </div>
  );
}
