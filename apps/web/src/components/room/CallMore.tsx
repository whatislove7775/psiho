"use client";

import { useEffect, useState } from "react";
import { Camera, Expand, Flag, Mic, NotebookPen, RefreshCw, Shrink, Speaker, Wind } from "lucide-react";
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
    <label className={s.devRow}>
      <span className={s.devIcon}>{icon}</span>
      <span className={s.devBody}>
        <span className={s.devLabel}>{label}</span>
        <select className={s.select} value={value ?? opts[0].deviceId} onChange={(e) => onChange(e.target.value)}>
          {opts.map((d, i) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `${label} ${i + 1}`}
            </option>
          ))}
        </select>
      </span>
    </label>
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
}) {
  return (
    <div className={s.more}>
      <div className={s.moreGroup}>
        <DeviceSelect icon={<Camera size={18} />} label="Камера" kind="videoinput" devices={devices} value={choice.videoinput} onChange={(id) => onDevice("videoinput", id)} />
        <DeviceSelect icon={<Mic size={18} />} label="Микрофон" kind="audioinput" devices={devices} value={choice.audioinput} onChange={(id) => onDevice("audioinput", id)} />
        {canPickSpeaker() && (
          <DeviceSelect icon={<Speaker size={18} />} label="Динамик" kind="audiooutput" devices={devices} value={choice.audiooutput} onChange={(id) => onDevice("audiooutput", id)} />
        )}
      </div>
      <div className={s.moreGroup}>
        <button type="button" className={s.moreItem} onClick={onFullscreen}>
          {fullscreen ? <Shrink size={18} /> : <Expand size={18} />}
          {fullscreen ? "Выйти из полноэкранного режима" : "На весь экран"}
        </button>
        {!isPro && onRecalibrate && (
          <button type="button" className={s.moreItem} onClick={onRecalibrate} disabled={recalibrating}>
            <RefreshCw size={18} />
            {recalibrating ? "Запоминаем спокойное лицо…" : "Откалибровать мимику"}
          </button>
        )}
        <button type="button" className={s.moreItem} onClick={onBreath}>
          <Wind size={18} />
          Дыхательная пауза
        </button>
        {onNotes && (
          <button type="button" className={s.moreItem} onClick={onNotes}>
            <NotebookPen size={18} />
            Заметки к звонку
          </button>
        )}
        <button type="button" className={s.moreItem} onClick={onReport}>
          <Flag size={18} />
          Сообщить о проблеме со связью
        </button>
      </div>
    </div>
  );
}
