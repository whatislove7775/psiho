"use client";

import { EyeOff, FileText, Send, Timer } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, Modal, Segmented } from "@/ui";
import type { AttachmentTtl } from "@/lib/api/chat";
import s from "./chat.module.css";

export interface FileSendOptions {
  text: string;
  ttl: AttachmentTtl | null;
  viewOnce: boolean;
}

const TTL: { value: "off" | AttachmentTtl; label: string }[] = [
  { value: "off", label: "Нет" },
  { value: "1m", label: "1 мин" },
  { value: "1h", label: "1 час" },
  { value: "1d", label: "1 день" },
];

function fmtSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} МБ`;
}

/** After picking a file: preview, caption, «Просмотр один раз», «Исчезнет через …», then send. */
export function AttachSheet({
  file,
  onClose,
  onSend,
}: {
  file: File | null;
  onClose: () => void;
  onSend: (file: File, opts: FileSendOptions) => Promise<boolean | void> | boolean | void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [ttl, setTtl] = useState<"off" | AttachmentTtl>("off");
  const [once, setOnce] = useState(false);
  const [busy, setBusy] = useState(false);
  const isImage = !!file?.type.startsWith("image/");

  useEffect(() => {
    setText("");
    setTtl("off");
    setOnce(false);
    if (!file || !file.type.startsWith("image/")) return setUrl(null);
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  const send = async () => {
    if (!file || busy) return;
    setBusy(true);
    const ok = await onSend(file, { text: text.trim(), ttl: ttl === "off" ? null : ttl, viewOnce: once });
    setBusy(false);
    if (ok !== false) onClose();
  };

  return (
    <Modal open={!!file} onClose={() => !busy && onClose()} title={isImage ? "Отправить фото" : "Отправить файл"} width={440}>
      {file && (
        <div className={s.attach}>
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" className={s.attachPreview} />
          ) : (
            <div className={s.attachFile}>
              <FileText size={20} aria-hidden />
              <span className={s.fileName}>{file.name}</span>
              <span className={s.fileSize}>{fmtSize(file.size)}</span>
            </div>
          )}
          <textarea
            className={s.attachCaption}
            rows={1}
            maxLength={1000}
            placeholder="Подпись"
            aria-label="Подпись"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <label className={s.attachOpt}>
            <EyeOff size={18} aria-hidden />
            <span className={s.attachOptText}>
              Просмотр один раз
              <small>Откроется один раз, затем исчезнет у&nbsp;обоих</small>
            </span>
            <input type="checkbox" role="switch" className={s.switch} checked={once} onChange={(e) => setOnce(e.target.checked)} />
          </label>
          <div className={s.attachOpt}>
            <Timer size={18} aria-hidden />
            <span className={s.attachOptText}>Исчезнет через</span>
            <div className={s.attachSeg}>
              <Segmented value={ttl} onChange={setTtl} options={TTL} ariaLabel="Исчезнет через" />
            </div>
          </div>
          <Button variant="primary" block onClick={send} loading={busy} icon={<Send size={18} />}>
            Отправить
          </Button>
        </div>
      )}
    </Modal>
  );
}
