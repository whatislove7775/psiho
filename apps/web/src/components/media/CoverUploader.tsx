"use client";

import { t, tj } from "@/lib/i18n";
import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus, RefreshCw, Trash2 } from "lucide-react";
import { Button, Field, Modal } from "@/ui";
import { COVER_HINT, coverApi, type CoverCrop, type CoverImage } from "@/lib/api/authoring";
import { Cropper, readImage, type CropImage, type CropRect } from "./Cropper";
import s from "./media.module.css";

const TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Article cover: pick → crop 16:9 → server makes WebP variants (EXIF stripped). Empty = topic illustration. */
export function CoverUploader({
  value,
  onChange,
  error,
}: {
  value: CoverImage | null;
  onChange: (c: CoverImage | null) => void;
  error?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [img, setImg] = useState<(CropImage & { file: File }) | null>(null);
  const crop = useRef<CoverCrop>({ x: 0, y: 0, w: 1 });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => () => void (img && URL.revokeObjectURL(img.url)), [img]);

  const pick = async (file?: File) => {
    setErr(null);
    if (!file) return;
    try {
      const r = await readImage(file, { types: TYPES, maxBytes: 5 * 1024 * 1024, minW: 640, minH: 360 });
      setImg({ ...r, file });
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const onCrop = useCallback((c: CropRect) => (crop.current = { x: c.x, y: c.y, w: c.w }), []);

  const upload = async () => {
    if (!img) return;
    setBusy(true);
    setErr(null);
    try {
      onChange(await coverApi.upload(img.file, crop.current));
      setImg(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Field label={t("Обложка")} error={error ?? err ?? undefined}>
      <div className={s.cover}>
        <button type="button" className={s.coverBox} data-filled={value ? "" : undefined} onClick={() => input.current?.click()} aria-label={value ? t("Заменить обложку") : t("Загрузить обложку")}>
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value.md} alt="" />
          ) : (
            <span className={s.coverEmpty}>
              <ImagePlus size={22} strokeWidth={1.7} aria-hidden />
              {t("Загрузить обложку")}
            </span>
          )}
        </button>
        <p className={s.hint}>{tj("{COVER_HINT}. Без\u00a0обложки\u00a0— иллюстрация темы.", { COVER_HINT: t(COVER_HINT) })}</p>
        {value && (
          <div className={s.coverActions}>
            <Button type="button" variant="ghost" size="sm" icon={<RefreshCw size={14} />} onClick={() => input.current?.click()}>
              {t("Заменить")}
            </Button>
            <Button type="button" variant="ghost" size="sm" icon={<Trash2 size={14} />} onClick={() => onChange(null)}>
              {t("Убрать")}
            </Button>
          </div>
        )}
        <input
          ref={input}
          type="file"
          accept={TYPES.join(",")}
          hidden
          onChange={(e) => {
            void pick(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
      <Modal open={!!img} onClose={() => !busy && setImg(null)} title={t("Кадр обложки")} width={560}>
        {img && (
          <div className={s.modal}>
            <Cropper img={img} aspect={16 / 9} maxWidth={500} onCrop={onCrop} />
            <p className={s.hint}>{t("Так обложка будет выглядеть в\u00a0карточке и\u00a0в\u00a0начале статьи. Передвиньте картинку и\u00a0настройте масштаб.")}</p>
            {err && <p className={s.error}>{err}</p>}
            <div className={s.modalActions}>
              <Button type="button" variant="secondary" onClick={() => setImg(null)} disabled={busy}>
                {t("Отмена")}
              </Button>
              <Button type="button" variant="primary" onClick={upload} loading={busy}>
                {t("Сохранить обложку")}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </Field>
  );
}
