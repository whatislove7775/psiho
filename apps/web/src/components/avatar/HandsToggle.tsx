"use client";

import { t } from "@/lib/i18n";
import { SLOW_NET_NOTE, useGesturesPref, useHandsPref, useHandsState } from "@/lib/avatar/headz/hands/prefs";
import s from "./HandsToggle.module.css";

function Row({ on, set, label, sub }: { on: boolean; set: (v: boolean) => void; label: string; sub?: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} className={s.row} onClick={() => set(!on)}>
      <span className={s.label}>
        {label}
        {sub && <span className={s.sub}>{sub}</span>}
      </span>
      <span className={s.switch} aria-hidden />
    </button>
  );
}

/**
 * «Показывать руки» (default on, stored on this device; switched off by itself on a
 * slow connection — then one quiet line says so) and «Реакции жестами» (👍/👎 by hand).
 * Hands are recognised on this device only — the specialist sees just the avatar video.
 */
export function HandsToggle({ sub, className }: { sub?: string; className?: string }) {
  const [on, setOn] = useHandsPref();
  const [gestures, setGestures] = useGesturesPref();
  const auto = useHandsState().autoOff;
  return (
    <div className={`${s.stack} ${className ?? ""}`}>
      <Row on={on} set={setOn} label={t("Показывать руки")} sub={auto ? SLOW_NET_NOTE : sub} />
      {on && <Row on={gestures} set={setGestures} label={t("Реакции жестами")} sub={t("Большой палец вверх или\u00a0вниз\u00a0— реакция в\u00a0звонке")} />}
    </div>
  );
}
