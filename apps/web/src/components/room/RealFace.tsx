"use client";

/**
 * Opt-in real camera for clients.
 *
 * By default a client is only ever seen as their avatar. A client may choose
 * to show their real face instead: a deliberate choice behind a confirmation
 * dialog, an always-visible badge while it is on, and one tap back to the
 * avatar. Nothing is stored on the server; the optional "remember on this
 * device" preference lives in localStorage and is off by default.
 */
import { t } from "@/lib/i18n";
import { useState } from "react";
import { Eye, ScanFace, Smile, UserRound } from "lucide-react";
import { Button, Modal } from "@/ui";
import r from "./RealFace.module.css";

const KEY = "aprosop.realFace";

/** true only if the client explicitly asked to remember the real camera on this device */
export function loadRealFacePref(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function saveRealFacePref(on: boolean) {
  try {
    if (on) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode */
  }
}

/** Lobby: how the specialist will see you — avatar (default) or real face (asks first). */
export function FaceChoice({ real, onAsk, onAvatar }: { real: boolean; onAsk: () => void; onAvatar: () => void }) {
  return (
    <div className={r.choice} role="radiogroup" aria-label={t("Как\u00a0вас увидит специалист")}>
      <button type="button" role="radio" aria-checked={!real} className={r.option} onClick={onAvatar}>
        <Smile size={18} aria-hidden />
        <span>{t("Аватар")}</span>
      </button>
      <button type="button" role="radio" aria-checked={real} className={`${r.option} ${r.optionReal}`} onClick={() => !real && onAsk()}>
        <ScanFace size={18} aria-hidden />
        <span>{t("Настоящее лицо")}</span>
      </button>
    </div>
  );
}

/** The confirmation every switch to the real camera goes through. */
export function RealFaceConfirm({
  open,
  onClose,
  onConfirm,
  className,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (remember: boolean) => void;
  className?: string;
}) {
  const [remember, setRemember] = useState(false);
  return (
    <Modal open={open} onClose={onClose} title={t("Показать настоящее лицо?")} width={440} className={className}>
      <div className={r.confirm}>
        <span className={r.confirmIcon} aria-hidden>
          <UserRound size={26} />
        </span>
        <ul className={r.points}>
          <li>
            <strong>{t("Специалист увидит ваше лицо")}</strong>{" "}{t("с\u00a0камеры вместо аватара.")}
          </li>
          <li>{t("Вернуться к\u00a0аватару можно в\u00a0любой момент, одной кнопкой.")}</li>
          <li>{t("Видео не\u00a0записывается и\u00a0нигде не\u00a0сохраняется. Фильтр голоса продолжит работать, если он\u00a0включён.")}</li>
        </ul>
      </div>
      <div className={r.actions}>
        <Button variant="ghost" onClick={onClose}>
          {t("Оставить аватар")}
        </Button>
        <Button
          variant="primary"
          icon={<Eye size={18} />}
          onClick={() => {
            onConfirm(remember);
            setRemember(false);
          }}
        >
          {t("Показать лицо")}
        </Button>
      </div>
      <label className={r.remember}>
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        {t("Запомнить выбор на\u00a0этом устройстве")}
      </label>
    </Modal>
  );
}

/** Always visible while the real camera is on. */
export function FaceBadge({ onBack, className }: { onBack: () => void; className?: string }) {
  return (
    <div className={`${r.badge} ${className ?? ""}`} role="status">
      <span className={r.badgeDot} aria-hidden />
      <Eye size={15} aria-hidden />
      <span className={r.badgeText}>{t("Видно ваше лицо")}</span>
      <button type="button" className={r.badgeBtn} onClick={onBack}>
        {t("Вернуть аватар")}
      </button>
    </div>
  );
}
