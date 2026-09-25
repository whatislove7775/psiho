"use client";

import { Lock, MessageCirclePlus, Search, Timer } from "lucide-react";
import { useMemo, useState } from "react";
import { Button, EmptyState, Segmented, Skeleton } from "@/ui";
import type { DialogItem } from "@/lib/api/dialogs";
import { ConvAvatar } from "@/components/chat/ConvAvatar";
import { fmtTime } from "@/components/chat/MessageItem";
import { EmptyArt } from "@/components/illustrations";
import c from "@/components/chat/chat.module.css";
import { cardPreview, hm, isLive, useNow, weekdayDay } from "./time";
import s from "./dialogs.module.css";

type Filter = "all" | "calls" | "unread";

function when(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return fmtTime(iso);
  const diff = (now.getTime() - d.getTime()) / 86400000;
  if (diff < 6) return d.toLocaleDateString("ru-RU", { weekday: "short" });
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

function callChip(d: DialogItem, now: number) {
  const call = d.next_call;
  if (!call) return d.status === "proposal" ? { tone: "warn", text: "Предложено время созвона" } : null;
  if (isLive(call)) return { tone: "live", text: "Идёт созвон" };
  if (call.status === "awaiting_payment") return { tone: "warn", text: "Созвон ждёт оплаты" };
  const start = new Date(call.scheduled_at);
  const today = new Date(now);
  const tomorrow = new Date(now + 86400000);
  const day =
    start.toDateString() === today.toDateString()
      ? "сегодня"
      : start.toDateString() === tomorrow.toDateString()
        ? "завтра"
        : weekdayDay(call.scheduled_at);
  return { tone: "call", text: `Созвон ${day} в ${hm(call.scheduled_at)}` };
}

const PRIVACY = {
  client: "Специалист видит только ваш псевдоним и аватар. Сотрудники платформы не читают ваши диалоги.",
  specialist: "Клиент видит ваше имя и фото из профиля, вы — только его псевдоним и аватар. Переписка зашифрована.",
};

export function DialogList({
  items,
  selected,
  onSelect,
  mode,
  onNew,
}: {
  items: DialogItem[] | null;
  selected: string | null;
  onSelect: (id: string) => void;
  mode: "client" | "specialist";
  onNew?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const now = useNow(30_000);

  const { pinned, rest } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (items ?? []).filter((d) => !q || d.counterpart.name.toLowerCase().includes(q));
    const byFilter = (d: DialogItem) =>
      filter === "all" ? true : filter === "unread" ? d.unread > 0 : !!d.next_call || d.status === "proposal";
    const order = (d: DialogItem) => (d.kind === "ai" ? 0 : 1);
    return {
      pinned: list.filter((d) => d.pinned && byFilter(d)).sort((a, b) => order(a) - order(b)),
      rest: list
        .filter((d) => !d.pinned && byFilter(d))
        .sort((a, b) => {
          // live calls first, then by last activity
          const la = a.status === "live" ? 1 : 0;
          const lb = b.status === "live" ? 1 : 0;
          if (la !== lb) return lb - la;
          return (b.last_message_at ?? "").localeCompare(a.last_message_at ?? "");
        }),
    };
  }, [items, query, filter]);

  const unreadTotal = (items ?? []).reduce((n, d) => n + d.unread, 0);

  const row = (d: DialogItem) => {
    const chip = callChip(d, now);
    const preview =
      (d.last_message?.card ? cardPreview(d.last_message.card) : d.last_message?.text) ||
      (d.kind === "ai"
        ? "ИИ-помощник: поддержка и практики"
        : d.kind === "support"
          ? "Вопросы по оплате, созвонам и работе сервиса"
          : d.conversation_id
            ? "Нет сообщений"
            : "");
    return (
      <button
        key={d.id}
        type="button"
        className={c.item}
        aria-current={selected === d.id || (selected && d.conversation_id === selected) ? "true" : undefined}
        onClick={() => onSelect(d.id)}
      >
        <ConvAvatar who={d.counterpart} size={48} />
        <span className={c.itemBody}>
          <span className={c.itemTop}>
            <span className={c.itemName}>{d.counterpart.name}</span>
            {d.last_message_at && d.last_message && <span className={c.itemTime}>{when(d.last_message_at)}</span>}
          </span>
          <span className={c.itemBottom}>
            <span className={c.itemPreview}>
              {d.retention === "24h" && <Timer size={12} className={c.itemTimer} aria-label="24 часа" />}
              {preview}
            </span>
            {d.unread > 0 && <span className={c.unread}>{d.unread > 99 ? "99+" : d.unread}</span>}
          </span>
          {chip && (
            <span className={s.itemCall} data-tone={chip.tone}>
              {chip.tone === "live" && <span className={s.liveDot} aria-hidden />}
              {chip.text}
            </span>
          )}
        </span>
      </button>
    );
  };

  return (
    <aside className={c.listPane} aria-label="Список диалогов">
      <div className={c.listHead}>
        <h1 className={c.listTitle}>Диалоги</h1>
        {onNew && (
          <Button variant="soft" size="sm" onClick={onNew} icon={<MessageCirclePlus size={18} />} className={s.newBtn}>
            {mode === "client" ? "Новый" : "Написать"}
          </Button>
        )}
      </div>
      <label className={c.search}>
        <Search size={16} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={mode === "client" ? "Найти по имени" : "Найти по псевдониму"}
          aria-label="Поиск по диалогам"
        />
      </label>
      <div className={s.filters}>
        <Segmented<Filter>
          ariaLabel="Какие диалоги показать"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "Все" },
            { value: "calls", label: "С созвоном" },
            { value: "unread", label: unreadTotal ? `Новые ${unreadTotal > 99 ? "99+" : unreadTotal}` : "Новые" },
          ]}
        />
      </div>
      <div className={c.list}>
        {!items ? (
          Array.from({ length: 5 }, (_, i) => (
            <div key={i} className={c.item}>
              <Skeleton width={48} height={48} radius={24} />
              <div style={{ flex: 1, display: "grid", gap: 6 }}>
                <Skeleton width="50%" height={14} />
                <Skeleton width="80%" height={12} />
              </div>
            </div>
          ))
        ) : pinned.length + rest.length === 0 ? (
          query || filter !== "all" ? (
            <p className={s.emptyFilter}>
              {filter === "unread" ? "Все сообщения прочитаны." : filter === "calls" ? "Назначенных созвонов нет." : "Никого не нашлось."}
            </p>
          ) : (
            <EmptyState
              art={<EmptyArt scene="chats" />}
              title="Диалогов пока нет"
              text={
                mode === "client"
                  ? "Выберите специалиста и напишите ему — созвон можно назначить прямо в диалоге."
                  : "Когда клиент напишет вам или назначит созвон, диалог появится здесь."
              }
            />
          )
        ) : (
          <>
            {pinned.map(row)}
            {pinned.length > 0 && rest.length > 0 && <div className={s.pinnedGap} role="separator" />}
            {rest.map(row)}
            {mode === "client" && rest.length === 0 && filter === "all" && !query && (
              <div style={{ padding: "12px 10px" }}>
                <p className={s.muted} style={{ marginBottom: 10 }}>
                  С каждым специалистом у вас будет один диалог: переписка, созвоны и файлы в одном месте.
                </p>
                <Button variant="secondary" size="sm" href="/app/specialists">
                  Выбрать специалиста
                </Button>
              </div>
            )}
          </>
        )}
      </div>
      <div className={c.privacy}>
        <Lock size={16} />
        <p>{PRIVACY[mode]}</p>
      </div>
    </aside>
  );
}
