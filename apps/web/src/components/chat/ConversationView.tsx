"use client";

import { ArrowLeft, Eraser, LifeBuoy, MoreVertical, ScanEye, ShieldOff, Timer, Infinity as InfinityIcon } from "lucide-react";
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Button, Modal, Spinner, useToast } from "@/ui";
import { ApiError } from "@/lib/api/client";
import {
  chatApi,
  forgetAttachment,
  streamAIReply,
  uploadMessage,
  type AIStatus,
  type ChatMessage,
  type Conversation,
  type Retention,
} from "@/lib/api/chat";
import { chatSocket } from "@/lib/chat/socket";
import { findContacts } from "@/lib/chat/contacts";
import { Composer } from "./Composer";
import { ConvAvatar } from "./ConvAvatar";
import { MessageItem, type MessageActions } from "./MessageItem";
import { RetentionModal } from "./RetentionModal";
import { Tisha } from "./Tisha";
import { ScreenShield } from "@/components/privacy/ScreenShield";
import { ChatMenu, type ChatMenuItem } from "./ChatMenu";
import { PanicButton } from "@/components/privacy/PanicButton";
import { usePrivacyPrefs } from "@/lib/privacy/usePrivacy";
import type { VoiceClip } from "./useVoiceRecorder";
import type { FileSendOptions } from "./AttachSheet";
import s from "./chat.module.css";

const ROLE_SUB: Record<string, string> = {
  specialist: "Специалист",
  client: "Клиент",
  support: "Обычно отвечаем в\u00a0течение нескольких часов",
  ai: "ИИ-помощник, не\u00a0психолог",
};

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date();
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Сегодня";
  if (d.toDateString() === y.toDateString()) return "Вчера";
  return d.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: d.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}

/** «Исчезающие сообщения»: short label of the mode for chips and toasts. */
export const RETENTION_LABEL: Record<Retention, string> = { forever: "выкл", "24h": "1\u00a0день", "1h": "1\u00a0час" };

function upsert(list: ChatMessage[], msg: ChatMessage): ChatMessage[] {
  const i = list.findIndex((m) => m.id === msg.id);
  if (i >= 0) {
    const next = list.slice();
    next[i] = { ...list[i], ...msg, mine: msg.mine ?? list[i].mine };
    return next;
  }
  return [...list, msg].sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export function ConversationView({
  conv,
  onBack,
  onChange,
  ai,
  onAIStatus,
  renderSystem,
  headerActions,
  banner,
  compact,
  composerNotice,
  composerDisabled,
  subtitle,
  menuItems,
  onTitleClick,
}: {
  conv: Conversation;
  onBack?: () => void;
  onChange: (c: Conversation) => void;
  ai?: AIStatus | null;
  onAIStatus?: (st: AIStatus) => void;
  /** custom rendering of system messages with a card (dialogue call cards) */
  renderSystem?: (m: ChatMessage) => ReactNode | null;
  /** extra buttons in the header, before the settings menu */
  headerActions?: ReactNode;
  /** strip under the header (e.g. «созвон идёт — присоединиться») */
  banner?: ReactNode;
  /** no header / retention chip: thread + composer only (in-call side panel) */
  compact?: boolean;
  composerNotice?: ReactNode;
  composerDisabled?: boolean;
  /** replaces the role line under the name */
  subtitle?: string;
  /** extra items of the header «⋮» menu: dialogue items first; `danger` ones go to the red group at the end */
  menuItems?: ChatMenuItem[];
  /** makes the avatar + name a button (e.g. opens dialogue details) */
  onTitleClick?: () => void;
}) {
  const toast = useToast();
  const [blockedMsg, setBlockedMsg] = useState<string | null>(null);
  const isAI = conv.kind === "ai";
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [deleting, setDeleting] = useState<ChatMessage | null>(null);
  const [headMenu, setHeadMenu] = useState(false);
  const [retentionOpen, setRetentionOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [typing, setTyping] = useState(false);
  const [peerReadAt, setPeerReadAt] = useState(conv.peer_read_at);
  const [aiBusy, setAiBusy] = useState(false);
  const [sending, setSending] = useState(false);

  const scroller = useRef<HTMLDivElement>(null);
  const stickBottom = useRef(true);
  const prevHeight = useRef<number | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSent = useRef(0);
  const headMenuRef = useRef<HTMLDivElement>(null);
  const convRef = useRef(conv);
  convRef.current = conv;
  const [privacy] = usePrivacyPrefs();
  const shielded = privacy.screen_protect || !!conv.screen_protect;

  // Disappearing messages leave the screen right when they expire (the server hides them from then on too).
  useEffect(() => {
    const now = Date.now();
    let next = Infinity;
    for (const m of messages) {
      if (!m.expires_at || m.pending) continue;
      const t = Date.parse(m.expires_at);
      if (Number.isFinite(t) && t < next) next = t;
    }
    if (next === Infinity) return;
    const timer = setTimeout(
      () => {
        const t = Date.now();
        setMessages((xs) => xs.filter((m) => m.pending || !m.expires_at || !(Date.parse(m.expires_at) <= t)));
      },
      Math.max(0, Math.min(next - now + 50, 2 ** 31 - 1)),
    );
    return () => clearTimeout(timer);
  }, [messages]);

  const markRead = useCallback(() => {
    if (document.visibilityState !== "visible") return;
    chatApi.read(conv.id).catch(() => undefined);
    onChange({ ...convRef.current, unread: 0 });
  }, [conv.id, onChange]);

  // Initial load
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setMessages([]);
    setEditing(null);
    setPeerReadAt(conv.peer_read_at);
    stickBottom.current = true;
    chatApi
      .messages(conv.id)
      .then((page) => {
        if (!alive) return;
        setMessages(page.results);
        setHasMore(page.has_more);
        markRead();
      })
      .catch((e) => alive && toast(e instanceof ApiError ? e.message : "Не\u00a0получилось загрузить сообщения", { error: true }))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conv.id]);

  // Realtime
  useEffect(() => {
    return chatSocket.subscribe((e) => {
      if (e.type === "message.new" || e.type === "message.updated") {
        if (e.message.conversation !== conv.id) return;
        if (e.message.deleted) forgetAttachment(e.message.id);
        setMessages((xs) => upsert(xs, e.message));
        if (e.type === "message.new" && !e.message.mine) {
          setTyping(false);
          markRead();
        }
      } else if (e.type === "message.hidden" && e.conversation === conv.id) {
        setMessages((xs) => xs.filter((m) => m.id !== e.id));
      } else if (e.type === "conversation.cleared" && e.conversation === conv.id) {
        setMessages([]);
        setHasMore(false);
      } else if (e.type === "typing" && e.conversation === conv.id) {
        setTyping(true);
        if (typingTimer.current) clearTimeout(typingTimer.current);
        typingTimer.current = setTimeout(() => setTyping(false), 4500);
      } else if (e.type === "read" && e.conversation === conv.id) {
        setPeerReadAt(e.at);
      } else if (e.type === "conversation.updated" && e.conversation === conv.id) {
        chatApi.conversation(conv.id).then(onChange).catch(() => undefined);
      }
    });
  }, [conv.id, markRead, onChange]);

  useEffect(() => {
    const onVis = () => document.visibilityState === "visible" && markRead();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [markRead]);

  useEffect(() => {
    if (!headMenu) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setHeadMenu(false);
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [headMenu]);

  // Scroll management
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (prevHeight.current !== null) {
      el.scrollTop = el.scrollHeight - prevHeight.current;
      prevHeight.current = null;
    } else if (stickBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, typing, aiBusy]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    stickBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };

  const loadOlder = async () => {
    const first = messages.find((m) => !m.pending && !m.streaming);
    if (!first) return;
    setLoadingOlder(true);
    try {
      const page = await chatApi.messages(conv.id, first.id);
      prevHeight.current = scroller.current?.scrollHeight ?? null;
      setMessages((xs) => [...page.results.filter((m) => !xs.some((x) => x.id === m.id)), ...xs]);
      setHasMore(page.has_more);
    } catch {
      toast("Не\u00a0получилось загрузить более ранние сообщения", { error: true });
    } finally {
      setLoadingOlder(false);
    }
  };

  const sendTyping = () => {
    if (isAI) return;
    const now = Date.now();
    if (now - lastTypingSent.current < 2500) return;
    lastTypingSent.current = now;
    chatSocket.send({ type: "typing", conversation: conv.id });
  };

  // ── Sending ────────────────────────────────────────────────────────────
  const sendAI = async (text: string) => {
    if (aiBusy) return false;
    const tempId = `tmp-${Date.now()}`;
    const now = new Date().toISOString();
    const optimistic: ChatMessage = {
      id: tempId, conversation: conv.id, kind: "text", sender_role: "client", text, system_code: null,
      attachment: null, created_at: now, edited_at: null, deleted: false, expires_at: null, mine: true, pending: true,
    };
    stickBottom.current = true;
    setMessages((xs) => [...xs, optimistic]);
    setAiBusy(true);
    const streamId = `stream-${Date.now()}`;
    let started = false;
    const patchStream = (fn: (t: string) => string) =>
      setMessages((xs) => {
        if (!started) {
          started = true;
          return [
            ...xs,
            {
              id: streamId, conversation: conv.id, kind: "text", sender_role: "ai", text: fn(""), system_code: null,
              attachment: null, created_at: new Date().toISOString(), edited_at: null, deleted: false,
              expires_at: null, mine: false, streaming: true,
            },
          ];
        }
        return xs.map((m) => (m.id === streamId ? { ...m, text: fn(m.text) } : m));
      });
    try {
      await streamAIReply(text, (ev) => {
        if (ev.type === "user_message") {
          setMessages((xs) => upsert(xs.filter((m) => m.id !== tempId), { ...ev.message, mine: true }));
          if (ai && onAIStatus) onAIStatus({ ...ai, remaining_today: ev.remaining_today });
        } else if (ev.type === "delta") {
          patchStream((t) => t + ev.text);
        } else if (ev.type === "replace") {
          patchStream(() => ev.text);
        } else if (ev.type === "done") {
          setMessages((xs) => upsert(xs.filter((m) => m.id !== streamId), { ...ev.message, mine: false }));
        } else if (ev.type === "error") {
          setMessages((xs) => xs.filter((m) => m.id !== streamId));
          toast(ev.detail, { error: true });
        }
      });
      return true;
    } catch (e) {
      setMessages((xs) => xs.filter((m) => m.id !== tempId && m.id !== streamId));
      toast(e instanceof ApiError ? e.message : "Тиша сейчас не\u00a0может ответить", { error: true });
      return false;
    } finally {
      setAiBusy(false);
    }
  };

  const sendText = async (text: string) => {
    if (editing) {
      try {
        const updated = await chatApi.edit(editing.id, text);
        setMessages((xs) => upsert(xs, { ...updated, mine: true }));
        setEditing(null);
        return true;
      } catch (e) {
        if (e instanceof ApiError && e.status === 422) setBlockedMsg(e.message);
        else toast(e instanceof ApiError ? e.message : "Не\u00a0получилось изменить", { error: true });
        return false;
      }
    }
    if (isAI) return sendAI(text);
    const tempId = `tmp-${Date.now()}`;
    const optimistic: ChatMessage = {
      id: tempId, conversation: conv.id, kind: "text", sender_role: conv.my_role, text, system_code: null,
      attachment: null, created_at: new Date().toISOString(), edited_at: null, deleted: false,
      expires_at: conv.retention !== "forever" ? "pending" : null, mine: true, pending: true,
    };
    stickBottom.current = true;
    setMessages((xs) => [...xs, optimistic]);
    try {
      const msg = await chatApi.sendText(conv.id, text);
      setMessages((xs) => upsert(xs.filter((m) => m.id !== tempId), { ...msg, mine: true }));
      return true;
    } catch (e) {
      setMessages((xs) => xs.filter((m) => m.id !== tempId));
      // 422 — в тексте контакты (до первого созвона): показываем под полем ввода, текст остаётся
      if (e instanceof ApiError && e.status === 422) setBlockedMsg(e.message);
      else toast(e instanceof ApiError ? e.message : "Не\u00a0получилось отправить", { error: true });
      return false;
    }
  };

  const sendVoice = async (clip: VoiceClip) => {
    try {
      const msg = await uploadMessage(conv.id, {
        kind: "voice", file: clip.blob, filename: clip.filename, duration_ms: clip.durationMs, peaks: clip.peaks,
        transcript: clip.transcript,
      });
      stickBottom.current = true;
      setMessages((xs) => upsert(xs, { ...msg, mine: true }));
      return true;
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Не\u00a0получилось отправить голосовое", { error: true });
      return false;
    }
  };

  const sendFile = async (file: File, opts?: FileSendOptions) => {
    if (file.size > 20 * 1024 * 1024) {
      toast("Файл больше 20\u00a0МБ", { error: true });
      return false;
    }
    if (conv.contacts_locked && findContacts(file.name.replace(/\.[^.]+$/, "")).length) {
      toast("Название файла похоже на\u00a0контакт\u00a0— переименуйте файл.", { error: true });
      return false;
    }
    if (conv.contacts_locked && opts?.text && findContacts(opts.text).length) {
      toast("В\u00a0подписи похоже на\u00a0контакт\u00a0— до\u00a0первого созвона так нельзя.", { error: true });
      return false;
    }
    setSending(true);
    try {
      const msg = await uploadMessage(conv.id, {
        kind: "file", file, filename: file.name, text: opts?.text, ttl: opts?.ttl, view_once: opts?.viewOnce,
      });
      stickBottom.current = true;
      setMessages((xs) => upsert(xs, { ...msg, mine: true }));
      return true;
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Не\u00a0получилось отправить файл", { error: true });
      return false;
    } finally {
      setSending(false);
    }
  };

  const actions: MessageActions = {
    onCopy: (m) => {
      navigator.clipboard?.writeText(m.text).then(() => toast("Скопировано"), () => undefined);
      setMenuFor(null);
    },
    onEdit: (m) => {
      setEditing({ id: m.id, text: m.text });
      setMenuFor(null);
    },
    onDelete: (m) => {
      setDeleting(m);
      setMenuFor(null);
    },
  };

  const doDelete = async (scope: "me" | "all") => {
    const m = deleting;
    if (!m) return;
    setDeleting(null);
    try {
      const res = await chatApi.remove(m.id, scope);
      forgetAttachment(m.id);
      if (scope === "me") setMessages((xs) => xs.filter((x) => x.id !== m.id));
      else if (res) setMessages((xs) => upsert(xs, { ...res, mine: true }));
      if (editing?.id === m.id) setEditing(null);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Не\u00a0получилось удалить", { error: true });
    }
  };

  const setRetention = async (r: Retention) => {
    try {
      const updated = await chatApi.setRetention(conv.id, r);
      onChange(updated);
      const page = await chatApi.messages(conv.id);
      setMessages(page.results);
      toast(
        r === "forever"
          ? "Исчезающие сообщения выключены"
          : `Исчезающие сообщения: ${RETENTION_LABEL[r]}. Новые сообщения исчезнут у\u00a0обоих`,
      );
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Не\u00a0получилось изменить режим", { error: true });
    }
  };

  const toggleScreenProtect = async () => {
    const next = !conv.screen_protect;
    try {
      const updated = await chatApi.setScreenProtect(conv.id, next);
      onChange(updated);
      toast(next ? "Защита от\u00a0скриншотов включена для\u00a0обеих сторон" : "Защита от\u00a0скриншотов выключена");
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Не\u00a0получилось изменить настройку", { error: true });
    }
  };

  const clearChat = async () => {
    setClearOpen(false);
    try {
      const updated = await chatApi.clear(conv.id);
      messages.forEach((m) => forgetAttachment(m.id));
      setMessages([]);
      setHasMore(false);
      onChange(updated);
      toast("Чат очищен у\u00a0вас");
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Не\u00a0получилось очистить чат", { error: true });
    }
  };

  const revokeAI = async () => {
    setHeadMenu(false);
    try {
      const st = await chatApi.aiRevoke();
      onAIStatus?.(st);
    } catch {
      toast("Не\u00a0получилось отозвать согласие", { error: true });
    }
  };

  const ownSide = (m: ChatMessage) => (m.pending ? true : m.sender_role === conv.my_role);
  const readAt = peerReadAt ? new Date(peerReadAt).getTime() : 0;
  const sub = typing
    ? "печатает…"
    : isAI
      ? ROLE_SUB.ai
      : subtitle
        ? subtitle
        : conv.counterpart.type === "support"
          ? ROLE_SUB.support
          : ROLE_SUB[conv.counterpart.type] ?? "";

  let lastDay = "";
  return (
    <section className={s.view} aria-label={`Диалог: ${conv.counterpart.name}`} data-compact={compact ? "" : undefined}>
      {!compact && (
      <header className={s.viewHead}>
        {onBack && (
          <button type="button" className={`${s.iconBtn} ${s.backBtn}`} onClick={onBack} aria-label="Назад к&nbsp;списку диалогов" data-back="">
            <ArrowLeft size={20} />
          </button>
        )}
        {onTitleClick ? (
          <button type="button" className={s.viewTitleBtn} onClick={onTitleClick} aria-label={`${conv.counterpart.name}: о\u00a0диалоге`}>
            <ConvAvatar who={conv.counterpart} size={42} />
            <span className={s.viewTitle}>
              <span className={s.viewName} style={{ display: "block" }}>{conv.counterpart.name}</span>
              <span className={`${s.viewSub} ${typing ? s.viewSubTyping : ""}`} style={{ display: "block" }}>{sub}</span>
            </span>
          </button>
        ) : (
          <>
            <ConvAvatar who={conv.counterpart} size={42} />
            <div className={s.viewTitle}>
              <div className={s.viewName}>{conv.counterpart.name}</div>
              <div className={`${s.viewSub} ${typing ? s.viewSubTyping : ""}`}>{sub}</div>
            </div>
          </>
        )}
        <PanicButton inline />
        {headerActions}
        <div className={s.headMenuWrap} ref={headMenuRef}>
          <button
            type="button"
            className={s.iconBtn}
            onClick={() => setHeadMenu((v) => !v)}
            aria-label="Настройки чата"
            aria-expanded={headMenu}
          >
            <MoreVertical size={20} />
          </button>
          {headMenu && (
            <ChatMenu
              anchor={headMenuRef.current}
              onClose={() => setHeadMenu(false)}
              groups={[
                (menuItems ?? []).filter((it) => !it.danger),
                [
                  {
                    key: "retention",
                    icon: <Timer size={17} />,
                    label: "Исчезающие сообщения",
                    hint: conv.retention === "forever" ? "Выключены: переписка хранится" : `Новые исчезают через\u00a0${RETENTION_LABEL[conv.retention]}`,
                    onClick: () => setRetentionOpen(true),
                  },
                  ...(conv.can_change_retention && !isAI
                    ? [
                        {
                          key: "screen",
                          icon: <ScanEye size={17} />,
                          label: "Защита от\u00a0скриншотов",
                          hint: "Скрывает переписку, когда окно не\u00a0активно",
                          checked: !!conv.screen_protect,
                          onClick: () => void toggleScreenProtect(),
                        },
                      ]
                    : []),
                ],
                [
                  ...(menuItems ?? []).filter((it) => it.danger),
                  { key: "clear", icon: <Eraser size={17} />, label: "Очистить чат у\u00a0себя", hint: "У\u00a0собеседника переписка останется", danger: true, onClick: () => setClearOpen(true) },
                  ...(isAI
                    ? [{ key: "revoke", icon: <ShieldOff size={17} />, label: "Отозвать согласие", hint: "Тиша перестанет отвечать", danger: true, onClick: () => void revokeAI() }]
                    : []),
                ],
              ]}
            />
          )}
        </div>
      </header>
      )}

      {!compact && (
        <button type="button" className={s.retentionChip} onClick={() => setRetentionOpen(true)}>
          {conv.retention !== "forever" ? <Timer size={14} /> : <InfinityIcon size={14} />}
          <span className={s.retentionText}>
            {conv.retention !== "forever"
              ? `Исчезают через ${RETENTION_LABEL[conv.retention]}`
              : "Сообщения хранятся, пока вы\u00a0их\u00a0не\u00a0удалите"}
          </span>
          {shielded && (
            <span className={s.retentionShield} title="Защита от&nbsp;скриншотов включена">
              <ScanEye size={14} aria-label="Защита от&nbsp;скриншотов включена" />
            </span>
          )}
        </button>
      )}

      {banner}

      {isAI && !compact && (
        <div className={s.aiNotice}>
          <LifeBuoy size={16} />
          <span>
            Тиша&nbsp;— ИИ, а&nbsp;не&nbsp;психолог. Если очень тяжело: <a href="tel:88003334434" title="8-800-333-44-34">телефон доверия</a> или{" "}
            <a href="tel:112">112</a>.
          </span>
        </div>
      )}

      <ScreenShield active={shielded}>
      <div className={s.scroller} ref={scroller} onScroll={onScroll}>
        {loading ? (
          <div className={s.center}>
            <Spinner />
          </div>
        ) : (
          <>
            {hasMore && (
              <div className={s.olderWrap}>
                <Button variant="ghost" size="sm" onClick={loadOlder} loading={loadingOlder}>
                  Показать более ранние
                </Button>
              </div>
            )}
            {messages.length === 0 && !isAI && (
              <div className={s.emptyConv}>
                <p>Здесь пока пусто. Напишите первое сообщение или&nbsp;запишите голосовое.</p>
              </div>
            )}
            {messages.map((m, i) => {
              const day = m.created_at.slice(0, 10);
              const showDay = day !== lastDay && !m.pending && !m.streaming;
              if (showDay) lastDay = day;
              if (m.kind === "system" && m.card && renderSystem) {
                const custom = renderSystem(m);
                if (custom) {
                  return (
                    <Fragment key={m.id}>
                      {showDay && <div className={s.day}>{dayLabel(m.created_at)}</div>}
                      {custom}
                    </Fragment>
                  );
                }
              }
              const next = messages[i + 1];
              const own = ownSide(m);
              const showTail = !next || next.kind === "system" || ownSide(next) !== own;
              return (
                <Fragment key={m.id}>
                  {showDay && <div className={s.day}>{dayLabel(m.created_at)}</div>}
                  <MessageItem
                    msg={m}
                    own={own}
                    read={readAt > 0 && new Date(m.created_at).getTime() <= readAt}
                    actions={actions}
                    menuOpen={menuFor === m.id}
                    onMenu={(open) => setMenuFor(open ? m.id : null)}
                    showTail={showTail}
                  />
                </Fragment>
              );
            })}
            {isAI && aiBusy && !messages.some((m) => m.streaming) && (
              <div className={s.aiTyping}>
                <Tisha size={44} state="typing" />
                <span>Тиша думает…</span>
              </div>
            )}
            {typing && !isAI && (
              <div className={s.typingRow} aria-live="polite">
                <span className={s.typingDots}>
                  <i />
                  <i />
                  <i />
                </span>
              </div>
            )}
          </>
        )}
      </div>

      </ScreenShield>

      {isAI && ai && (
        <div className={s.aiLimit}>
          {ai.remaining_today > 0
            ? `Сегодня можно отправить Тише ещё ${ai.remaining_today}`
            : "Лимит сообщений Тише на\u00a0сегодня исчерпан\u00a0— завтра можно продолжить"}
        </div>
      )}
      {composerNotice}
      <Composer
        onSendText={sendText}
        onSendVoice={sendVoice}
        onSendFile={sendFile}
        onTyping={sendTyping}
        allowVoice={!isAI}
        allowFiles={conv.can_send_files}
        filesHint={conv.files_hint}
        guardContacts={!!conv.contacts_locked}
        blockedMessage={blockedMsg}
        onBlockedClear={() => setBlockedMsg(null)}
        placeholder={isAI ? "Напишите Тише" : "Сообщение"}
        editing={editing}
        onCancelEdit={() => setEditing(null)}
        busy={aiBusy || sending}
        disabled={(isAI && !!ai && ai.remaining_today <= 0) || composerDisabled}
      />

      <RetentionModal
        open={retentionOpen}
        onClose={() => setRetentionOpen(false)}
        conv={conv}
        onSave={async (r) => {
          setRetentionOpen(false);
          if (r !== conv.retention) await setRetention(r);
        }}
      />

      <Modal open={clearOpen} onClose={() => setClearOpen(false)} title="Очистить чат у&nbsp;себя?" width={440}>
        <p className={s.modalText}>
          Сообщения исчезнут только у&nbsp;вас.{" "}
          {isAI
            ? "Тиша тоже перестанет их\u00a0учитывать в\u00a0разговоре."
            : "У\u00a0собеседника переписка останется\u00a0— чтобы убрать сообщение у\u00a0всех, удалите его через меню сообщения."}
        </p>
        <div className={s.modalActions}>
          <Button variant="ghost" onClick={() => setClearOpen(false)}>
            Отмена
          </Button>
          <Button variant="danger" onClick={clearChat}>
            Очистить
          </Button>
        </div>
      </Modal>

      <Modal open={!!deleting} onClose={() => setDeleting(null)} title="Удалить сообщение?" width={440}>
        <p className={s.modalText}>
          {deleting?.mine
            ? "«Удалить у\u00a0всех» уберёт сообщение и\u00a0у\u00a0собеседника\u00a0— останется только отметка, что\u00a0оно было удалено."
            : "Сообщение исчезнет только у\u00a0вас."}
        </p>
        <div className={s.modalActionsCol}>
          {deleting && deleting.mine && (
            <Button variant="danger" block onClick={() => doDelete("all")}>
              Удалить у&nbsp;всех
            </Button>
          )}
          <Button variant="secondary" block onClick={() => doDelete("me")}>
            Удалить у&nbsp;меня
          </Button>
          <Button variant="ghost" block onClick={() => setDeleting(null)}>
            Отмена
          </Button>
        </div>
      </Modal>
    </section>
  );
}
