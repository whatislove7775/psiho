"use client";

import { CalendarPlus, EyeOff, Lock, PanelRight, Timer, Video, Mic, AlertCircle } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, EmptyState, Modal, Skeleton, useToast } from "@/ui";
import { ApiError } from "@/lib/api/client";
import { chatApi, type AIStatus, type Contact, type Conversation, type Retention } from "@/lib/api/chat";
import { dialogsApi, type DialogDetail, type DialogItem } from "@/lib/api/dialogs";
import { chatSocket } from "@/lib/chat/socket";
import { AIIntro } from "@/components/chat/AIIntro";
import { ConvAvatar } from "@/components/chat/ConvAvatar";
import { ChatBubbles, EmptyArt } from "@/components/illustrations";
import c from "@/components/chat/chat.module.css";
import art from "@/components/chat/art.module.css";
import { DialogActionsProvider, useDialogController } from "./DialogActions";
import { DialogList } from "./DialogList";
import { DialogThread } from "./DialogThread";
import { InfoPanel } from "./InfoPanel";
import { hm, isLive, weekdayDay } from "./time";
import s from "./dialogs.module.css";

type Mode = "client" | "specialist";
type InfoState = "auto" | "open" | "closed";

const WIDE = "(min-width: 1361px)";

/** Messenger of dialogues: list + thread + info panel (client /app/dialogs, specialist /pro/dialogs). */
export function DialogsApp({ mode }: { mode: Mode }) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const params = useSearchParams();
  const toast = useToast();
  const selected = params?.get("d") ?? null;

  const [items, setItems] = useState<DialogItem[] | null>(null);
  const [ai, setAi] = useState<AIStatus | null>(null);
  const [detail, setDetail] = useState<DialogDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [info, setInfo] = useState<InfoState>("auto");
  const [opening, setOpening] = useState(false);
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const select = useCallback(
    (id: string | null) => {
      router.replace(id ? `${pathname}?d=${encodeURIComponent(id)}` : pathname, { scroll: false });
    },
    [router, pathname],
  );

  const loadList = useCallback(async () => {
    try {
      const [list, st] = await Promise.all([
        dialogsApi.list(),
        mode === "client" ? chatApi.ai().catch(() => null) : Promise.resolve(null),
      ]);
      setItems(list);
      if (st) setAi(st);
    } catch (e) {
      setItems((x) => x ?? []);
      toast(e instanceof ApiError ? e.message : "Не получилось загрузить диалоги", { error: true });
    }
  }, [mode, toast]);

  useEffect(() => {
    void loadList();
    const t = setInterval(loadList, 60_000); // «можно входить» and countdown states
    return () => clearInterval(t);
  }, [loadList]);

  useEffect(() => chatSocket.acquire(), []);

  // Current item: by conversation id or by pseudo id («support», «ai»)
  const item = useMemo(
    () => (selected && items ? items.find((d) => d.id === selected || d.conversation_id === selected) ?? null : null),
    [items, selected],
  );
  const isSpecialistDialog = item?.kind === "specialist";

  const loadDetail = useCallback(async () => {
    if (!selected || !isSpecialistDialog) return;
    try {
      const d = await dialogsApi.get(selected);
      setDetail(d);
      setDetailError(null);
      setItems((list) => (list ? list.map((x) => (x.id === d.id ? { ...x, ...pickItem(d) } : x)) : list));
    } catch (e) {
      setDetailError(e instanceof ApiError ? e.message : "Не получилось загрузить диалог");
    }
  }, [selected, isSpecialistDialog]);

  useEffect(() => {
    setDetail((d) => (d && d.id === selected ? d : null));
    setDetailError(null);
    void loadDetail();
  }, [loadDetail, selected]);

  // Realtime: list previews, unread counters and call state
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  useEffect(() => {
    let pending: ReturnType<typeof setTimeout> | null = null;
    const refreshSoon = () => {
      if (pending) clearTimeout(pending);
      pending = setTimeout(() => {
        void loadList();
        void loadDetail();
      }, 400);
    };
    const off = chatSocket.subscribe((e) => {
      if (e.type === "dialog.updated") {
        refreshSoon();
        return;
      }
      if (e.type !== "message.new") return;
      const m = e.message;
      setItems((list) => {
        if (!list) return list;
        const idx = list.findIndex((x) => x.conversation_id === m.conversation);
        if (idx < 0) {
          refreshSoon();
          return list;
        }
        const x = list[idx];
        const text = m.kind === "voice" ? "Голосовое сообщение" : m.kind === "file" ? "Файл" : m.text.slice(0, 120);
        const card = m.kind === "system" ? m.card ?? null : null;
        const isOpen = selectedRef.current === x.id || selectedRef.current === x.conversation_id;
        const next = list.slice();
        next[idx] = {
          ...x,
          last_message: { text, created_at: m.created_at, sender_role: m.sender_role, kind: m.kind, card },
          last_message_at: m.created_at,
          unread: !m.mine && !isOpen && m.kind !== "system" ? x.unread + 1 : x.unread,
        };
        return next;
      });
      if (m.kind === "file") refreshSoon();
    });
    return () => {
      off();
      if (pending) clearTimeout(pending);
    };
  }, [loadList, loadDetail]);

  // Pseudo ids → real conversations
  useEffect(() => {
    if (!items || !selected) return;
    const sel = items.find((d) => d.id === selected);
    if (selected === "support" && sel && !sel.conversation_id && !opening) {
      setOpening(true);
      chatApi
        .start({ with: "support" })
        .then(async (conv) => {
          await loadList();
          select(conv.id);
        })
        .catch((e) => toast(e instanceof ApiError ? e.message : "Не получилось открыть поддержку", { error: true }))
        .finally(() => setOpening(false));
    } else if (sel && sel.conversation_id && sel.id !== sel.conversation_id) {
      select(sel.conversation_id);
    }
  }, [items, selected, opening, select, toast, loadList]);

  const { value: actions, modals } = useDialogController(isSpecialistDialog ? detail : null, loadDetail);

  const updateConv = useCallback((conv: Conversation) => {
    setItems((list) =>
      list
        ? list.map((x) =>
            x.conversation_id === conv.id ? { ...x, unread: conv.unread, retention: conv.retention } : x,
          )
        : list,
    );
  }, []);

  const setRetention = async (r: Retention) => {
    const convId = item?.conversation_id;
    if (!convId || r === item?.retention) return;
    try {
      const conv = await chatApi.setRetention(convId, r);
      updateConv(conv);
      if (detail) setDetail({ ...detail, retention: conv.retention, conversation: conv });
      toast(r === "24h" ? "Новые сообщения будут удаляться через 24 часа" : "Сообщения будут храниться бессрочно");
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Не получилось изменить режим", { error: true });
    }
  };

  const toggleInfo = () =>
    setInfo((v) =>
      typeof window !== "undefined" && window.matchMedia(WIDE).matches
        ? v === "closed"
          ? "auto"
          : "closed"
        : v === "open"
          ? "auto"
          : "open",
    );

  const openNew = async () => {
    if (mode === "client") {
      router.push("/app/specialists");
      return;
    }
    setNewOpen(true);
    if (!contacts) setContacts(await chatApi.contacts().catch(() => []));
  };

  const showAIIntro = mode === "client" && item?.kind === "ai" && !ai?.consent;
  const open = !!selected;

  // ── Thread column ────────────────────────────────────────────────────
  let thread: React.ReactNode;
  if (!selected) {
    thread = <Placeholder mode={mode} />;
  } else if (!items) {
    thread = (
      <div className={c.placeholder}>
        <Skeleton width={220} height={18} />
      </div>
    );
  } else if (!item) {
    thread = (
      <div className={c.placeholder}>
        <EmptyState
          art={<EmptyArt scene="search" />}
          title="Диалог не найден"
          text="Возможно, у вас нет к нему доступа или ссылка устарела."
          action={
            <Button variant="secondary" onClick={() => select(null)}>
              К списку диалогов
            </Button>
          }
        />
      </div>
    );
  } else if (showAIIntro) {
    thread = (
      <AIIntro
        status={ai}
        onBack={() => select(null)}
        onConsent={async (st) => {
          setAi(st);
          await loadList();
          if (st.conversation_id) select(st.conversation_id);
        }}
      />
    );
  } else if (!item.conversation_id) {
    thread = (
      <div className={c.placeholder}>
        <Skeleton width={220} height={18} />
      </div>
    );
  } else if (isSpecialistDialog) {
    const call = detail?.next_call ?? item.next_call;
    const live = !!call && isLive(call);
    const left = detail?.first_messages_left ?? null;
    const role = detail?.my_role ?? item.my_role;
    thread = detailError && !detail ? (
      <div className={c.placeholder}>
        <EmptyState
          art={<EmptyArt scene="search" />}
          title="Диалог недоступен"
          text={detailError}
          action={
            <Button variant="secondary" onClick={() => select(null)}>
              К списку диалогов
            </Button>
          }
        />
      </div>
    ) : (
      <DialogThread
        key={item.conversation_id}
        conversationId={item.conversation_id}
        conversation={detail?.conversation}
        onBack={() => select(null)}
        onChange={updateConv}
        subtitle={
          call
            ? live
              ? "Созвон идёт"
              : `Созвон ${weekdayDay(call.scheduled_at)} в ${hm(call.scheduled_at)}`
            : role === "client"
              ? "Специалист"
              : "Анонимный клиент"
        }
        headerActions={
          <>
            {actions && (role === "client" ? detail?.can_book : detail?.can_propose) && (
              <Button
                variant="soft"
                size="sm"
                className={s.headBtn}
                icon={<CalendarPlus size={18} strokeWidth={1.8} />}
                onClick={role === "client" ? actions.openBook : actions.openPropose}
                aria-label={role === "client" ? "Назначить созвон" : "Предложить время созвона"}
              >
                <span className={s.headBtnLabel}>{role === "client" ? "Назначить созвон" : "Предложить время"}</span>
              </Button>
            )}
            <Button
              variant="ghost"
              size="md"
              iconOnly
              aria-label="Информация о диалоге"
              aria-pressed={info !== "closed"}
              onClick={toggleInfo}
              icon={<PanelRight size={20} strokeWidth={1.8} />}
            />
          </>
        }
        banner={
          live && call ? (
            <div className={s.liveBanner} role="status">
              <Video size={20} strokeWidth={1.8} aria-hidden />
              <div className={s.liveBannerText}>
                <strong>Созвон идёт</strong>
                <span>Собеседник может быть уже на связи</span>
              </div>
              <Button variant="white" size="sm" href={`/room/${call.id}`}>
                Присоединиться
              </Button>
            </div>
          ) : null
        }
        composerNotice={
          left !== null && role === "client" ? (
            <div className={s.limitNotice} role="note">
              <AlertCircle size={16} strokeWidth={1.8} aria-hidden />
              <span>
                {left > 0
                  ? `Пока специалист не ответил, можно отправить ещё ${left} ${left === 1 ? "сообщение" : left < 5 ? "сообщения" : "сообщений"}. Опишите коротко, с чем хотите прийти.`
                  : "Вы отправили несколько сообщений — дождитесь ответа специалиста или назначьте созвон."}
              </span>
            </div>
          ) : null
        }
        composerDisabled={left === 0 && role === "client"}
      />
    );
  } else {
    thread = (
      <DialogThread
        key={item.conversation_id}
        conversationId={item.conversation_id}
        onBack={() => select(null)}
        onChange={updateConv}
        ai={item.kind === "ai" ? ai : null}
        onAIStatus={(st) => {
          setAi(st);
          if (!st.consent) select("ai");
        }}
        headerActions={
          <Button
            variant="ghost"
            size="md"
            iconOnly
            aria-label="Информация о диалоге"
            aria-pressed={info !== "closed"}
            onClick={toggleInfo}
            icon={<PanelRight size={20} strokeWidth={1.8} />}
          />
        }
      />
    );
  }

  const showInfo = !!item && !showAIIntro && !!item.conversation_id;

  return (
    <DialogActionsProvider value={actions}>
      <div className={s.app} data-open={open ? "" : undefined} data-info={showInfo ? info : "closed"}>
        <DialogList items={items} selected={selected} onSelect={select} mode={mode} onNew={openNew} />
        <div className={s.threadPane}>{thread}</div>
        {showInfo && (
          <>
            {info === "open" && <button type="button" className={s.scrim} aria-label="Закрыть" onClick={() => setInfo("auto")} />}
            <aside className={s.info} aria-label="О диалоге">
              <InfoPanel item={item} detail={isSpecialistDialog ? detail : null} onClose={() => setInfo("auto")} onRetention={setRetention} />
            </aside>
          </>
        )}
      </div>
      {modals}

      <Modal open={newOpen} onClose={() => setNewOpen(false)} title="Написать клиенту" width={460}>
        {!contacts ? (
          <div style={{ display: "grid", gap: 10 }}>
            <Skeleton height={52} />
            <Skeleton height={52} />
          </div>
        ) : contacts.length === 0 ? (
          <p className={s.modalText}>Когда клиент назначит с вами созвон, здесь можно будет начать с ним диалог.</p>
        ) : (
          <div className={c.contacts}>
            {contacts.map((x) => (
              <button
                key={x.client_alias ?? x.psychologist_id}
                type="button"
                className={c.item}
                onClick={async () => {
                  try {
                    const d = await dialogsApi.startWithClient(x.client_alias!);
                    setNewOpen(false);
                    await loadList();
                    select(d.id);
                  } catch (e) {
                    toast(e instanceof ApiError ? e.message : "Не получилось начать диалог", { error: true });
                  }
                }}
              >
                <ConvAvatar who={{ type: x.type, name: x.name, avatar_config: x.avatar_config }} size={42} />
                <span className={c.itemBody}>
                  <span className={c.itemName}>{x.name}</span>
                  <span className={c.itemPreview}>Анонимный клиент</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </Modal>
    </DialogActionsProvider>
  );
}

function pickItem(d: DialogDetail): Partial<DialogItem> {
  return {
    next_call: d.next_call,
    status: d.status,
    calls_count: d.calls_count,
    unread: d.unread,
    retention: d.retention,
    last_message: d.last_message,
    last_message_at: d.last_message_at,
  };
}

function Placeholder({ mode }: { mode: Mode }) {
  return (
    <div className={c.placeholder}>
      <ChatBubbles className={art.placeholderArt} />
      <h2 className={c.placeholderTitle}>Переписка и созвоны в одном месте</h2>
      <p className={c.placeholderText}>
        {mode === "client"
          ? "Выберите диалог слева. С каждым специалистом у вас один диалог:"
          : "Выберите диалог слева. С каждым клиентом у вас один диалог:"}
      </p>
      <ul className={c.features}>
        <li>
          <CalendarPlus size={18} />{" "}
          {mode === "client" ? "Созвоны назначаются прямо в диалоге по расписанию специалиста" : "Предлагайте клиенту время созвона прямо в диалоге"}
        </li>
        <li>
          <Video size={18} /> Когда созвон начнётся, в диалоге появится кнопка «Присоединиться»
        </li>
        <li>
          <Lock size={18} /> Сообщения и файлы хранятся в зашифрованном виде
        </li>
        <li>
          <Timer size={18} /> Режим «24 часа»: новые сообщения исчезают сами через сутки
        </li>
        <li>
          <Mic size={18} /> Голосовые можно записать с маской голоса
        </li>
        <li>
          <EyeOff size={18} /> Сотрудники платформы не читают диалоги клиентов и специалистов
        </li>
      </ul>
    </div>
  );
}
