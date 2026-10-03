"use client";

import { t, intlLocale } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/ui";
import { staffSelfieApi, type StaffSelfieMeta } from "@/lib/api/authoring";
import s from "./selfie.module.css";

const fmt = (iso: string) => new Date(iso).toLocaleDateString(intlLocale(), { day: "numeric", month: "short" });

/**
 * Verification selfie in the staff queue (specialists.verify only). Frames are fetched on demand —
 * every view goes to the audit log — and are never cached (kept only in memory while open).
 */
export function SelfieReview({ profileId }: { profileId: number }) {
  const [meta, setMeta] = useState<StaffSelfieMeta | null>(null);
  const [frames, setFrames] = useState<{ frames: string[]; challenge_text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMeta(null);
    setFrames(null);
    staffSelfieApi.meta(profileId).then(setMeta).catch((e) => setError((e as Error).message));
  }, [profileId]);

  if (error) return <span className={s.missing}>{error}</span>;
  if (!meta) return <span className={s.staffLine}>…</span>;
  if (!meta.exists) return <span className={s.missing}>{t("Не\u00a0сделано\u00a0— одобрить пока нельзя")}</span>;

  const show = async () => {
    setBusy(true);
    try {
      setFrames(await staffSelfieApi.frames(profileId));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={s.staff}>
      <span className={s.staffLine}>
        {t("Снято")}{" "}{meta.taken_at ? fmt(meta.taken_at) : ""}
        {meta.delete_after ? t(` · удалится {fmt}`, { fmt: fmt(meta.delete_after) }) : t(` · удалится через {retention_days} дн. после одобрения`, { retention_days: meta.retention_days })}
        {frames ? (
          <Button type="button" variant="ghost" size="sm" icon={<EyeOff size={14} />} onClick={() => setFrames(null)}>
            {t("Скрыть")}
          </Button>
        ) : (
          <Button type="button" variant="ghost" size="sm" icon={<Eye size={14} />} loading={busy} onClick={show}>
            {t("Показать")}
          </Button>
        )}
      </span>
      {frames && (
        <>
          <div className={s.frames}>
            {frames.frames.map((src, i) => (
              <figure key={i}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={i === 0 ? t("Кадр 1: прямо в\u00a0камеру") : t(`Кадр 2: {challenge_text}`, { challenge_text: frames.challenge_text })} />
                <figcaption>{i === 0 ? t("Прямо в\u00a0камеру") : frames.challenge_text}</figcaption>
              </figure>
            ))}
          </div>
          <span className={s.staffLine}>{t("Просмотр записан в\u00a0журнал действий.")}</span>
        </>
      )}
    </div>
  );
}
