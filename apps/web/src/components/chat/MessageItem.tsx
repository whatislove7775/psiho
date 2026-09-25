"use client";

import { Check, CheckCheck, Clock3, Copy, Download, FileText, MoreHorizontal, Pencil, Timer, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { attachmentUrl, type ChatMessage } from "@/lib/api/chat";
import { VoicePlayer } from "./VoicePlayer";
import s from "./chat.module.css";

export function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} МБ`;
}

function FileCard({ msg }: { msg: ChatMessage }) {
  const att = msg.attachment!;
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isImage = att.mime.startsWith("image/");

  useEffect(() => {
    if (!isImage) return;
    let alive = true;
    attachmentUrl(msg.id)
      .then((u) => alive && setPreview(u))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [isImage, msg.id]);

  const download = async () => {
    setBusy(true);
    try {
      const url = await attachmentUrl(msg.id);
      const a = document.createElement("a");
      a.href = url;
      a.download = att.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={s.fileWrap}>
      {isImage && preview && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt={att.name} className={s.imagePreview} onClick={download} />
      )}
      <button type="button" className={s.fileCard} onClick={download} disabled={busy}>
        <span className={s.fileIcon}>{busy ? <span className={s.miniSpin} /> : <FileText size={20} />}</span>
        <span className={s.fileMeta}>
          <span className={s.fileName}>{att.name}</span>
          <span className={s.fileSize}>
            {att.name.split(".").pop()?.toUpperCase()}, {fmtSize(att.size)}
          </span>
        </span>
        <Download size={18} className={s.fileDl} />
      </button>
    </div>
  );
}

export interface MessageActions {
  onEdit: (m: ChatMessage) => void;
  onDelete: (m: ChatMessage) => void;
  onCopy: (m: ChatMessage) => void;
}

export function MessageItem({
  msg,
  own,
  read,
  actions,
  menuOpen,
  onMenu,
  showTail,
}: {
  msg: ChatMessage;
  own: boolean;
  read: boolean;
  actions: MessageActions;
  menuOpen: boolean;
  onMenu: (open: boolean) => void;
  showTail?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onMenu(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onMenu(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [menuOpen, onMenu]);

  if (msg.kind === "system") {
    return (
      <div className={s.system}>
        <span>{msg.text}</span>
      </div>
    );
  }

  const canMenu = !msg.deleted && !msg.pending && !msg.streaming;
  const bubbleTone = own ? s.mine : msg.sender_role === "ai" ? s.ai : s.theirs;

  return (
    <div className={`${s.row} ${own ? s.rowMine : ""}`} ref={ref}>
      <div
        className={`${s.bubble} ${bubbleTone} ${msg.deleted ? s.deleted : ""} ${showTail ? s.tail : ""} ${
          msg.kind === "voice" ? s.bubbleVoice : ""
        }`}
        onContextMenu={(e) => {
          if (!canMenu) return;
          e.preventDefault();
          onMenu(true);
        }}
      >
        {msg.deleted ? (
          <span className={s.deletedText}>
            <Trash2 size={14} /> Сообщение удалено
          </span>
        ) : msg.kind === "voice" && msg.attachment ? (
          <VoicePlayer
            messageId={msg.id}
            peaks={msg.attachment.peaks}
            durationMs={msg.attachment.duration_ms ?? 0}
            tone={own ? "mine" : "theirs"}
          />
        ) : msg.kind === "file" && msg.attachment ? (
          <FileCard msg={msg} />
        ) : (
          <span className={s.text}>
            {msg.text}
            {msg.streaming && <span className={s.caret} aria-hidden />}
          </span>
        )}
        <span className={s.meta}>
          {msg.expires_at && !msg.deleted && (
            <span title="Удалится через 24 часа после отправки" className={s.metaIcon}>
              <Timer size={12} />
            </span>
          )}
          {msg.edited_at && !msg.deleted && <span>изменено</span>}
          <span>{fmtTime(msg.created_at)}</span>
          {own && !msg.deleted && msg.sender_role !== "ai" && (
            <span className={s.metaIcon} aria-label={msg.pending ? "Отправляется" : read ? "Прочитано" : "Доставлено"}>
              {msg.pending ? <Clock3 size={13} /> : read ? <CheckCheck size={14} /> : <Check size={14} />}
            </span>
          )}
        </span>
      </div>
      {canMenu && (
        <button
          type="button"
          className={s.moreBtn}
          aria-label="Действия с сообщением"
          aria-expanded={menuOpen}
          onClick={() => onMenu(!menuOpen)}
        >
          <MoreHorizontal size={18} />
        </button>
      )}
      {menuOpen && (
        <div className={`${s.menu} ${own ? s.menuMine : ""}`} role="menu">
          {msg.kind === "text" && (
            <button type="button" role="menuitem" onClick={() => actions.onCopy(msg)}>
              <Copy size={16} /> Копировать
            </button>
          )}
          {own && msg.kind === "text" && msg.sender_role !== "ai" && (
            <button type="button" role="menuitem" onClick={() => actions.onEdit(msg)}>
              <Pencil size={16} /> Изменить
            </button>
          )}
          <button type="button" role="menuitem" className={s.menuDanger} onClick={() => actions.onDelete(msg)}>
            <Trash2 size={16} /> Удалить
          </button>
        </div>
      )}
    </div>
  );
}
