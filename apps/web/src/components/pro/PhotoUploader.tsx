"use client";

import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { ImageUp, Trash2, ZoomIn, ZoomOut } from "lucide-react";
import { Button, Modal, useToast } from "@/ui";
import { SpecialistPhoto } from "@/components/avatar/SpecialistPhoto";
import { PHOTO_MAX_BYTES, PHOTO_TYPES, photoApi, type PhotoCrop } from "@/lib/api/photos";
import s from "./PhotoUploader.module.css";

const VIEW = 280; // crop viewport, px
const MAX_ZOOM = 3;

interface Img {
  url: string;
  file: File;
  w: number;
  h: number;
}

/** Square crop editor: drag to move, slider to zoom. Returns normalised crop. */
function Cropper({ img, onCrop }: { img: Img; onCrop: (c: PhotoCrop) => void }) {
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);

  const scale = (VIEW / Math.min(img.w, img.h)) * zoom;
  const W = img.w * scale;
  const H = img.h * scale;
  const clamp = (p: { x: number; y: number }) => ({
    x: Math.min(0, Math.max(VIEW - W, p.x)),
    y: Math.min(0, Math.max(VIEW - H, p.y)),
  });

  // Centre on first render and keep the centre while zooming.
  const prevScale = useRef<number | null>(null);
  useEffect(() => {
    setPos((p) => {
      if (prevScale.current === null) return clamp({ x: (VIEW - W) / 2, y: (VIEW - H) / 2 });
      const k = scale / prevScale.current;
      return clamp({ x: VIEW / 2 - (VIEW / 2 - p.x) * k, y: VIEW / 2 - (VIEW / 2 - p.y) * k });
    });
    prevScale.current = scale;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale]);

  useEffect(() => {
    onCrop({
      x: Math.max(0, -pos.x / scale / img.w),
      y: Math.max(0, -pos.y / scale / img.h),
      size: Math.min(1, 1 / zoom),
    });
  }, [pos, scale, zoom, img, onCrop]);

  const down = (e: RPointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, x: pos.x, y: pos.y };
  };
  const move = (e: RPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    setPos(clamp({ x: d.x + e.clientX - d.px, y: d.y + e.clientY - d.py }));
  };
  const up = () => (drag.current = null);

  return (
    <div className={s.cropper}>
      <div
        className={s.view}
        style={{ width: VIEW, height: VIEW }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onWheel={(e) => setZoom((z) => Math.min(MAX_ZOOM, Math.max(1, z - e.deltaY * 0.0015)))}
        aria-label="Передвиньте фото, чтобы выбрать кадр"
        role="img"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={img.url} alt="" draggable={false} style={{ width: W, height: H, transform: `translate(${pos.x}px, ${pos.y}px)` }} />
        <span className={s.ring} aria-hidden />
      </div>
      <div className={s.zoom}>
        <ZoomOut size={18} aria-hidden />
        <input
          type="range"
          min={1}
          max={MAX_ZOOM}
          step={0.01}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          aria-label="Масштаб"
        />
        <ZoomIn size={18} aria-hidden />
      </div>
    </div>
  );
}

export function PhotoUploader({
  url,
  name,
  onChange,
}: {
  url: string | null | undefined;
  name: string;
  onChange: (url: string | null) => void;
}) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [img, setImg] = useState<Img | null>(null);
  const crop = useRef<PhotoCrop>({ x: 0, y: 0, size: 1 });
  const [busy, setBusy] = useState<"upload" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () => () => {
      if (img) URL.revokeObjectURL(img.url);
    },
    [img],
  );

  const pick = (file: File | undefined) => {
    setError(null);
    if (!file) return;
    if (!PHOTO_TYPES.includes(file.type)) return setError("Подойдёт фото в формате JPEG, PNG или WebP.");
    if (file.size > PHOTO_MAX_BYTES) return setError("Файл больше 5 МБ. Выберите фото поменьше.");
    const url = URL.createObjectURL(file);
    const probe = new Image();
    probe.onload = () => {
      if (Math.min(probe.naturalWidth, probe.naturalHeight) < 200) {
        URL.revokeObjectURL(url);
        setError("Фото слишком маленькое. Нужно хотя бы 200×200 пикселей.");
        return;
      }
      setImg({ url, file, w: probe.naturalWidth, h: probe.naturalHeight });
    };
    probe.onerror = () => {
      URL.revokeObjectURL(url);
      setError("Не получилось открыть файл. Попробуйте другое фото.");
    };
    probe.src = url;
  };

  const upload = async () => {
    if (!img) return;
    setBusy("upload");
    try {
      const res = await photoApi.upload(img.file, crop.current);
      onChange(res.photo_url);
      setImg(null);
      toast("Фото сохранено");
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy("delete");
    try {
      await photoApi.remove();
      onChange(null);
      toast("Фото удалено");
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={s.root}>
      <SpecialistPhoto url={url} name={name || "?"} size={104} alt="Ваше фото" />
      <div className={s.body}>
        <p className={s.text}>
          Настоящее фото, на котором хорошо видно лицо. Клиенты видят его в каталоге, при записи и на созвоне. JPEG, PNG или WebP до 5 МБ.
        </p>
        <div className={s.actions}>
          <Button variant="primary" size="sm" icon={<ImageUp size={16} />} onClick={() => input.current?.click()} disabled={!!busy}>
            {url ? "Заменить фото" : "Загрузить фото"}
          </Button>
          {url && (
            <Button variant="ghost" size="sm" icon={<Trash2 size={16} />} onClick={remove} loading={busy === "delete"}>
              Удалить
            </Button>
          )}
        </div>
        {error && (
          <p className={s.error} role="alert">
            {error}
          </p>
        )}
        <input
          ref={input}
          type="file"
          accept={PHOTO_TYPES.join(",")}
          hidden
          onChange={(e) => {
            pick(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>

      <Modal open={!!img} onClose={() => !busy && setImg(null)} title="Выберите кадр" width={400}>
        {img && (
          <div className={s.modal}>
            <Cropper img={img} onCrop={(c) => (crop.current = c)} />
            <p className={s.text}>Передвиньте фото и настройте масштаб. Лицо лучше разместить по центру круга.</p>
            <div className={s.modalActions}>
              <Button variant="secondary" onClick={() => setImg(null)} disabled={!!busy}>
                Отмена
              </Button>
              <Button variant="primary" onClick={upload} loading={busy === "upload"}>
                Сохранить фото
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
