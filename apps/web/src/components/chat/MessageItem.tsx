"use client";

import {
  Check, CheckCheck, Clock3, Copy, Download, EyeOff, FileAudio, FileText, FileType2, Image as ImageIcon, ImageOff,
  MoreHorizontal, Pencil, Timer, Trash2,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AttachmentViewer, saveAttachment, viewKind } from "./AttachmentViewer";
import { attachmentUrl, openViewOnce, type ChatMessage } from "@/lib/api/chat";
import { VoicePlayer } from "./VoicePlayer";
import { VoiceTranscript } from "@/components/captions/VoiceTranscript";
import s from "./chat.module.css";

export function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} МБ`;
}

/** Image: ONLY the picture (like popular messengers) + optional caption; name/type/size live in the viewer. */
function ImageCard({ msg, meta }: { msg: ChatMessage; meta?: ReactNode }) {
  const att = msg.attachment!;
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [open, setOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const w = att.width || 4;
  const h = att.height || 3;
  // Keep the thumbnail inside 280×300 with the real aspect ratio (no layout jumps while loading)
  const scale = Math.min(1, 280 / w, 300 / h);
  const width = att.width ? Math.max(120, Math.round(w * scale)) : 240;

  useEffect(() => {
    let alive = true;
    setState("loading");
    attachmentUrl(msg.id)
      .then((u) => alive && setUrl(u))
      .catch(() => alive && setState("error"));
    return () => {
      alive = false;
    };
  }, [msg.id, attempt]);

  return (
    <div className={`${s.fileWrap} ${s.imageWrap}`} style={{ width }}>
      <div className={s.imageBox}>
        <button
          type="button"
          className={s.imageThumb}
          data-state={state}
          style={{ aspectRatio: att.width ? `${w} / ${h}` : "4 / 3" }}
          onClick={() => (state === "error" ? setAttempt((n) => n + 1) : state === "ready" && setOpen(true))}
          aria-label={state === "error" ? "Не\u00a0загрузилось\u00a0— повторить" : `Посмотреть ${att.name}`}
        >
          {url && state !== "error" && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" onLoad={() => setState("ready")} onError={() => setState("error")} />
          )}
          {state === "loading" && <span className={s.thumbSkeleton} aria-hidden />}
          {state === "error" && (
            <span className={s.thumbError}>
              <ImageOff size={20} />
              <span>Не&nbsp;загрузилось. Повторить</span>
            </span>
          )}
        </button>
        {/* time/status sits on the picture's bottom-right corner over a soft scrim (without a caption) */}
        {!msg.text && meta}
      </div>
      {msg.text && <span className={`${s.text} ${s.caption}`}>{msg.text}</span>}
      {open && (
        <AttachmentViewer msgId={msg.id} name={att.name} mime={att.mime} size={att.size} caption={msg.text} onClose={() => setOpen(false)} />
      )}
    </div>
  );
}

/** «Просмотр один раз»: a placeholder; the recipient opens it once (then it is gone for both). */
function ViewOnceCard({ msg, own }: { msg: ChatMessage; own: boolean }) {
  const att = msg.attachment;
  const photo = !!att?.mime.startsWith("image/");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [opened, setOpened] = useState<{ url: string; name: string; caption: string } | null>(null);
  const viewed = !!msg.viewed_at;
  const label = viewed ? (photo ? "Фото просмотрено" : "Файл просмотрен") : photo ? "Фото" : "Файл";
  const sub = viewed ? null : own ? "Один просмотр · ещё не\u00a0открыто" : "Один просмотр · нажмите, чтобы открыть";
  const canOpen = !own && !viewed && !!att;

  const open = async () => {
    if (!canOpen || busy) return;
    setBusy(true);
    setErr(null);
    try {
      setOpened(await openViewOnce(msg.id));
    } catch (e) {
      setErr((e as Error).message || "Не\u00a0получилось открыть");
    } finally {
      setBusy(false);
    }
  };
  const close = () => {
    if (opened) URL.revokeObjectURL(opened.url);
    setOpened(null);
  };

  const Icon = viewed ? EyeOff : photo ? ImageIcon : FileText;
  const body = (
    <>
      <span className={s.onceIcon} data-viewed={viewed || undefined}>
        {busy ? <span className={s.miniSpin} /> : <Icon size={18} />}
      </span>
      <span className={s.fileMeta}>
        <span className={s.fileName}>{label}</span>
        {(err || sub) && <span className={s.fileSize}>{err ?? sub}</span>}
      </span>
    </>
  );
  return (
    <div className={s.fileWrap}>
      {canOpen ? (
        <button type="button" className={`${s.fileCard} ${s.onceCard}`} onClick={open} aria-label={`Открыть: ${label}, один просмотр`}>
          {body}
        </button>
      ) : (
        <div className={`${s.fileCard} ${s.onceCard}`}>{body}</div>
      )}
      {opened && att && (
        <AttachmentViewer msgId={msg.id} name={opened.name} mime={att.mime} size={att.size} caption={opened.caption} viewOnceUrl={opened.url} onClose={close} />
      )}
    </div>
  );
}

/** Compact row: type icon, name, size; «Открыть» for what the browser can show, and a download button. */
function FileRow({ msg, onOpen, compact }: { msg: ChatMessage; onOpen: () => void; compact?: boolean }) {
  const att = msg.attachment!;
  const [busy, setBusy] = useState(false);
  const kind = viewKind(att.mime, att.name);
  const ext = att.name.split(".").pop()?.toUpperCase() ?? "";
  const Icon = kind === "image" ? ImageIcon : kind === "pdf" ? FileType2 : att.mime.startsWith("audio/") ? FileAudio : FileText;

  const download = async () => {
    setBusy(true);
    try {
      await saveAttachment(msg.id, att.name);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`${s.fileCard} ${compact ? s.fileCardCompact : ""}`}>
      {!compact && (
        <span className={s.fileIcon} data-kind={kind ?? "file"}>
          <Icon size={20} />
        </span>
      )}
      <span className={s.fileMeta}>
        <span className={s.fileName} title={att.name}>
          {att.name}
        </span>
        <span className={s.fileSize}>
          {ext}, {fmtSize(att.size)}
        </span>
      </span>
      {kind && !compact && (
        <button type="button" className={s.fileOpen} onClick={onOpen}>
          Открыть
        </button>
      )}
      <button
        type="button"
        className={kind ? s.fileDlBtn : s.fileOpen}
        onClick={download}
        disabled={busy}
        aria-label={`Скачать ${att.name}`}
        title="Скачать"
      >
        {busy ? <span className={s.miniSpin} /> : kind ? <Download size={17} /> : "Скачать"}
      </button>
    </div>
  );
}

function FileCard({ msg }: { msg: ChatMessage }) {
  const att = msg.attachment!;
  const [open, setOpen] = useState(false);
  return (
    <div className={s.fileWrap}>
      <FileRow msg={msg} onOpen={() => setOpen(true)} />
      {msg.text && <span className={`${s.text} ${s.caption}`}>{msg.text}</span>}
      {open && (
        <AttachmentViewer msgId={msg.id} name={att.name} mime={att.mime} size={att.size} caption={msg.text} onClose={() => setOpen(false)} />
      )}
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
  const isOnce = msg.kind === "file" && !msg.deleted && !!msg.view_once;
  const isImage = !isOnce && msg.kind === "file" && !msg.deleted && !!msg.attachment?.mime.startsWith("image/");

  const meta = (
    <span className={s.meta}>
      {msg.expires_at && !msg.deleted && (
        <span title={expiryTitle(msg.expires_at)} className={s.metaIcon}>
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
  );

  return (
    <div className={`${s.row} ${own ? s.rowMine : ""}`} ref={ref}>
      <div
        className={`${s.bubble} ${bubbleTone} ${msg.deleted ? s.deleted : ""} ${showTail ? s.tail : ""} ${
          msg.kind === "voice" ? s.bubbleVoice : ""
        } ${isImage ? s.bubbleImage : msg.kind === "file" && !msg.deleted ? s.bubbleFile : ""}`}
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
          <>
            <VoicePlayer
              messageId={msg.id}
              peaks={msg.attachment.peaks}
              durationMs={msg.attachment.duration_ms ?? 0}
              tone={own ? "mine" : "theirs"}
            />
            <VoiceTranscript messageId={msg.id} text={msg.text} tone={own ? "mine" : "theirs"} />
          </>
        ) : isOnce ? (
          <ViewOnceCard msg={msg} own={own} />
        ) : isImage ? (
          <ImageCard msg={msg} meta={meta} />
        ) : msg.kind === "file" && msg.attachment ? (
          <FileCard msg={msg} />
        ) : (
          <span className={s.text}>
            {msg.text}
            {msg.streaming && <span className={s.caret} aria-hidden />}
          </span>
        )}
        {(!isImage || !!msg.text) && meta}
      </div>
      {canMenu && (
        <button
          type="button"
          className={s.moreBtn}
          aria-label="Действия с&nbsp;сообщением"
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

/** «Исчезнет в 14:05» / «Исчезнет завтра в 09:30» for disappearing messages. */
function expiryTitle(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "Исчезающее сообщение";
  const d = new Date(t);
  const hm = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  const left = t - Date.now();
  if (left < 60 * 60 * 1000) return `Исчезнет через\u00a0${Math.max(1, Math.ceil(left / 60000))}\u00a0мин`;
  return d.toDateString() === new Date().toDateString() ? `Исчезнет в\u00a0${hm}` : `Исчезнет завтра в\u00a0${hm}`;
}
