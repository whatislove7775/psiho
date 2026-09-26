"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { CalendarDays, ChevronDown, Headphones, Lamp, MessagesSquare, ShieldCheck, Sparkles, Video } from "lucide-react";
import { Button, Card, CardHead, Skeleton } from "@/ui";
import { SpecialistPhoto } from "@/components/avatar/SpecialistPhoto";
import { AvatarThumb } from "@/components/avatar/AvatarThumb";
import { ConvAvatar } from "@/components/chat/ConvAvatar";
import { fmtTime } from "@/components/chat/MessageItem";
import { dialogHref, dialogsApi, type DialogItem } from "@/lib/api/dialogs";
import { durationLabel } from "@/lib/api/availability";
import { rub } from "@/lib/format";
import { cardPreview, countdown, hm, isLive, range, useNow, weekdayDay } from "./time";
import r from "@/components/client/rail.module.css";
import s from "./dialogs.module.css";
import { SearchTrigger } from "@/components/search/SpecialistSearch";

/** Dialogues for home pages: the nearest call across all dialogues + the most recent ones. */
export function useDialogsSummary() {
  const [items, setItems] = useState<DialogItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    dialogsApi
      .list()
      .then((x) => {
        setItems(x);
        setError(null);
      })
      .catch(() => setError("Не получилось загрузить диалоги"));
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);
  const next = useMemo(() => {
    const withCalls = (items ?? []).filter((d) => d.next_call);
    withCalls.sort((a, b) => a.next_call!.scheduled_at.localeCompare(b.next_call!.scheduled_at));
    return withCalls[0] ?? null;
  }, [items]);
  const recent = useMemo(
    () =>
      (items ?? [])
        .filter((d) => d.kind === "specialist")
        .sort((a, b) => (b.last_message_at ?? "").localeCompare(a.last_message_at ?? ""))
        .slice(0, 4),
    [items],
  );
  return { items, next, recent, error, loading: !items && !error, reload: load };
}

function Row({ icon, title, sub }: { icon: ReactNode; title: ReactNode; sub: ReactNode }) {
  return (
    <div className={r.row}>
      <span className={r.rowIcon} aria-hidden>
        {icon}
      </span>
      <span className={r.rowText}>
        <strong>{title}</strong>
        <span>{sub}</span>
      </span>
    </div>
  );
}

/** Accent rail card «Ближайший созвон» (or an invitation for the first dialogue). */
export function NextCallCard({ item, loading, role }: { item: DialogItem | null; loading?: boolean; role: "client" | "specialist" }) {
  const titleId = useId();
  const now = useNow(15_000);
  if (loading) {
    return (
      <section className={r.accent} aria-busy>
        <div className={r.skel}>
          <Skeleton width="60%" height={22} />
          <Skeleton width={72} height={72} radius={36} />
          <Skeleton height={58} radius={18} />
          <Skeleton height={54} radius={999} />
        </div>
      </section>
    );
  }
  const call = item?.next_call;
  if (!item || !call) {
    return (
      <section className={r.accent} aria-labelledby={titleId}>
        <div className={r.head}>
          <h2 id={titleId} className={r.title}>
            {role === "client" ? "Первый созвон" : "Ближайших созвонов нет"}
          </h2>
        </div>
        <p className={r.lead}>
          {role === "client"
            ? "Выберите специалиста и напишите ему или сразу назначьте созвон. Вместо лица специалист увидит ваш аватар."
            : "Клиенты назначают созвоны в диалогах по вашему расписанию. Вы тоже можете предложить время в диалоге."}
        </p>
        <div className={r.rows}>
          <Row
            icon={<MessagesSquare size={18} strokeWidth={1.8} />}
            title="Один диалог на пару"
            sub="Переписка, созвоны и файлы в одном месте"
          />
          <Row
            icon={<CalendarDays size={18} strokeWidth={1.8} />}
            title="От 50 минут до 3 часов"
            sub="Длительность выбирается при записи, цена зависит от неё"
          />
        </div>
        {role === "client" ? (
          <SearchTrigger variant="white" size="lg" block>
            Выбрать специалиста
          </SearchTrigger>
        ) : (
          <Button variant="white" size="lg" block href="/pro/schedule">
            Открыть расписание
          </Button>
        )}
      </section>
    );
  }

  const live = isLive(call);
  const who = item.counterpart;
  return (
    <section className={r.accent} aria-labelledby={titleId}>
      <div className={r.head}>
        <h2 id={titleId} className={r.title}>
          {live ? "Созвон идёт" : "Ближайший созвон"}
        </h2>
        <span className={r.pill}>{call.can_join ? "Можно входить" : countdown(call.scheduled_at, call.duration_minutes, now)}</span>
      </div>
      <div className={r.person}>
        {who.type === "specialist" ? (
          <SpecialistPhoto url={who.photo_url ?? null} name={who.name} size={72} />
        ) : (
          <AvatarThumb config={who.avatar_config} seed={who.name} size={72} background="rgba(255,255,255,.18)" />
        )}
        <div className={r.personText}>
          <strong>{who.name}</strong>
          <span>
            {durationLabel(call.duration_minutes)}, {rub(call.amount_rub)}
            {call.status === "awaiting_payment" ? ", ждёт оплаты" : ""}
          </span>
        </div>
      </div>
      <div className={r.rows}>
        <Row
          icon={<CalendarDays size={18} strokeWidth={1.8} />}
          title={`${weekdayDay(call.scheduled_at)}, ${hm(call.scheduled_at)}`}
          sub={range(call.scheduled_at, call.duration_minutes)}
        />
        {call.can_join ? (
          <Row
            icon={<ShieldCheck size={18} strokeWidth={1.8} />}
            title={role === "client" ? "Вы будете аватаром" : "Клиент будет аватаром"}
            sub="Лицо клиента не передаётся, звонок зашифрован"
          />
        ) : role === "client" ? (
          <details className={r.tips}>
            <summary>
              <strong>Как подготовиться</strong>
              <ChevronDown size={16} strokeWidth={2} aria-hidden className={r.tipsChevron} />
            </summary>
            <ul>
              <li>
                <Lamp size={16} strokeWidth={1.8} aria-hidden /> Свет спереди, чтобы аватар точнее повторял мимику
              </li>
              <li>
                <Headphones size={16} strokeWidth={1.8} aria-hidden /> Наушники и место, где вас не услышат
              </li>
              <li>
                <Sparkles size={16} strokeWidth={1.8} aria-hidden /> Пара мыслей о том, с чем хотите прийти
              </li>
            </ul>
          </details>
        ) : null}
      </div>
      {call.can_join ? (
        <Button variant="white" size="lg" block href={`/room/${call.id}`} icon={<Video size={20} strokeWidth={1.8} />}>
          Присоединиться
        </Button>
      ) : (
        <Button variant="white" size="lg" block href={dialogHref(role, item.id)}>
          Открыть диалог
        </Button>
      )}
      <Link href={role === "client" ? "/app/avatar/mirror" : "/pro/check"} className={r.link}>
        Проверить камеру
      </Link>
    </section>
  );
}

/** «Недавние диалоги» card. */
export function RecentDialogs({ items, role, loading }: { items: DialogItem[]; role: "client" | "specialist"; loading?: boolean }) {
  return (
    <Card as="section" style={{ minWidth: 0 }}>
      <CardHead
        title="Недавние диалоги"
        action={
          <Button size="sm" variant="ghost" href={role === "client" ? "/app/dialogs" : "/pro/dialogs"}>
            Все
          </Button>
        }
      />
      {loading ? (
        <div style={{ display: "grid", gap: 10 }}>
          <Skeleton height={56} />
          <Skeleton height={56} />
        </div>
      ) : items.length === 0 ? (
        <p className={s.muted}>
          {role === "client"
            ? "Здесь появятся ваши диалоги со специалистами. Начните с профиля специалиста — написать можно и без записи."
            : "Когда клиент напишет вам или назначит созвон, диалог появится здесь."}
        </p>
      ) : (
        <div className={s.recent}>
          {items.map((d) => {
            const preview = d.last_message?.card ? cardPreview(d.last_message.card) : d.last_message?.text || "Нет сообщений";
            return (
              <Link key={d.id} href={dialogHref(role, d.id)} className={s.recentItem}>
                <ConvAvatar who={d.counterpart} size={44} />
                <span className={s.recentBody}>
                  <span className={s.recentTop}>
                    <span className={s.recentName}>{d.counterpart.name}</span>
                    {d.last_message && <span className={s.noteMeta}>{fmtTime(d.last_message.created_at)}</span>}
                  </span>
                  <span className={s.recentPreview} style={{ display: "block" }}>
                    {d.next_call ? `Созвон ${weekdayDay(d.next_call.scheduled_at)} в ${hm(d.next_call.scheduled_at)}. ` : ""}
                    {preview}
                  </span>
                </span>
                {d.unread > 0 && <span className={s.chip} style={{ background: "var(--c-primary)", color: "#fff" }}>{d.unread}</span>}
              </Link>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/** Compact one-row «nearest call» strip for home pages. Renders nothing without a call. */
export function NextCallStrip({ item, role }: { item: DialogItem | null; role: "client" | "specialist" }) {
  const now = useNow(15_000);
  const call = item?.next_call;
  if (!item || !call) return null;
  const live = isLive(call);
  const who = item.counterpart;
  const join = call.can_join;
  return (
    <section className={r.strip} aria-label={live ? "Созвон идёт" : "Ближайший созвон"}>
      <span className={r.stripFace} aria-hidden>
        {who.type === "specialist" ? (
          <SpecialistPhoto url={who.photo_url ?? null} name={who.name} size={40} />
        ) : (
          <AvatarThumb config={who.avatar_config} seed={who.name} size={40} background="rgba(255,255,255,.18)" />
        )}
      </span>
      <span className={r.stripText}>
        <strong>{who.name}</strong>
        <span>
          {live ? "Созвон идёт" : `${weekdayDay(call.scheduled_at)}, ${hm(call.scheduled_at)}`}
          {!join && !live ? ` · ${countdown(call.scheduled_at, call.duration_minutes, now)}` : ""}
          {call.status === "awaiting_payment" ? " · ждёт оплаты" : ""}
        </span>
      </span>
      {join ? (
        <Button variant="white" size="sm" href={`/room/${call.id}`} icon={<Video size={16} strokeWidth={1.8} />}>
          Войти
        </Button>
      ) : (
        <Button variant="white" size="sm" href={dialogHref(role, item.id)}>
          Открыть
        </Button>
      )}
    </section>
  );
}
