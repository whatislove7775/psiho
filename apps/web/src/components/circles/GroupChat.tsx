"use client";

/**
 * Group chat of a circle. Everyone appears under the circle pseudonym («Участник-Лиса»)
 * with a seeded avatar; the host under their name. Live updates come through the shared
 * chat WebSocket (/ws/chat/) as "circle.message" events.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Hourglass, Send, ShieldCheck } from "lucide-react";
import { Button, Spinner, useToast } from "@/ui";
import { AvatarThumb } from "@/components/avatar/AvatarThumb";
import { SpecialistPhoto } from "@/components/avatar/SpecialistPhoto";
import { ApiError } from "@/lib/api/client";
import { circlesApi, type CircleMessage, type CircleMessages } from "@/lib/api/circles";
import { chatSocket } from "@/lib/chat/socket";
import { time } from "@/lib/format";
import { cx, toneClass } from "./bits";
import s from "./circles.module.css";

const RETENTION_NOTE: Record<string, string> = {
  "1h": "Сообщения исчезают через час",
  "24h": "Сообщения исчезают через сутки",
  forever: "Сообщения видны только участникам круга",
};

type CircleEvent =
  | { type: "circle.message"; circle: string; message: CircleMessage }
  | { type: "circle.message.deleted"; circle: string; id: string };

export function GroupChat({ circleId, hostPhoto, compact }: { circleId: string; hostPhoto?: string | null; compact?: boolean }) {
  const toast = useToast();
  const [data, setData] = useState<CircleMessages | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  const load = useCallback(() => {
    circlesApi
      .messages(circleId)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Не получилось загрузить чат."));
  }, [circleId]);

  useEffect(() => {
    load();
    const release = chatSocket.acquire();
    const off = chatSocket.subscribe((raw) => {
      const e = raw as unknown as CircleEvent;
      if (!("circle" in e) || e.circle !== circleId) return;
      if (e.type === "circle.message") {
        setData((d) => (d && !d.results.some((m) => m.id === e.message.id) ? { ...d, results: [...d.results, e.message] } : d));
      } else if (e.type === "circle.message.deleted") {
        setData((d) => d && { ...d, results: d.results.map((m) => (m.id === e.id ? { ...m, deleted: true, text: "" } : m)) });
      }
    });
    // reconnect → refetch (missed events)
    const offStatus = chatSocket.onStatus((online) => online && load());
    return () => {
      off();
      offStatus();
      release();
    };
  }, [circleId, load]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [data]);

  // Hide messages as soon as they expire (the server stops serving them at the same moment)
  useEffect(() => {
    const t = setInterval(() => {
      const now = Date.now();
      setData((d) => (d && d.results.some((m) => m.expires_at && Date.parse(m.expires_at) <= now)
        ? { ...d, results: d.results.filter((m) => !m.expires_at || Date.parse(m.expires_at) > now) }
        : d));
    }, 20_000);
    return () => clearInterval(t);
  }, []);

  const send = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      const msg = await circlesApi.send(circleId, body);
      stick.current = true;
      setData((d) => (d && !d.results.some((m) => m.id === msg.id) ? { ...d, results: [...d.results, { ...msg, mine: true }] } : d));
      setText("");
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Не получилось отправить.", { error: true });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await circlesApi.deleteMessage(circleId, id);
      setData((d) => d && { ...d, results: d.results.map((m) => (m.id === id ? { ...m, deleted: true, text: "" } : m)) });
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Не получилось удалить.", { error: true });
    }
  };

  if (error) return <p className={s.note}>{error}</p>;
  if (!data) return <Spinner label="Загружаем чат" />;
  const isHost = data.my_role === "host";
  const myHandle = data.me?.handle;

  return (
    <div className={s.chat} style={compact ? { maxHeight: "100%", minHeight: 0, height: "100%" } : undefined}>
      <p className={s.chatNote}>
        {data.retention === "forever" ? <ShieldCheck size={14} /> : <Hourglass size={14} />}
        {RETENTION_NOTE[data.retention]}
        {data.me ? `. Вы пишете как ${data.me.name}` : ""}
      </p>
      <div
        className={s.chatScroll}
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
        }}
        aria-live="polite"
      >
        {data.results.length === 0 && <p className={s.sys}>Здесь пока тихо. Можно поздороваться первым.</p>}
        {data.results.map((m) => {
          if (m.author.kind === "system") {
            return (
              <p key={m.id} className={s.sys}>
                {m.text}
              </p>
            );
          }
          const mine = m.mine ?? (m.author.kind === "member" ? m.author.handle === myHandle : isHost);
          const host = m.author.kind === "host";
          const canDelete = !m.deleted && (mine || isHost);
          return (
            <div key={m.id} className={cx(s.msg, mine && s.msgMine, host && s.msgHost, toneClass(host ? "primary" : m.author.tone))}>
              {!mine &&
                (host ? (
                  <span className={s.hostDot}>
                    <SpecialistPhoto url={hostPhoto} name={m.author.name} size={30} />
                  </span>
                ) : (
                  <AvatarThumb config={null} seed={m.author.handle || m.author.name} size={30} />
                ))}
              <div className={s.msgBody}>
                {!mine && <span className={s.msgName}>{host ? `${m.author.name}, ведущий` : m.author.name}</span>}
                <div className={cx(s.bubble, m.deleted && s.bubbleDeleted)}>{m.deleted ? "Сообщение удалено" : m.text}</div>
                <span className={s.msgTime}>
                  {time(m.created_at)}
                  {m.expires_at && <Hourglass size={10} aria-label="Исчезающее сообщение" />}
                  {canDelete && (
                    <button type="button" className={s.msgDel} onClick={() => remove(m.id)}>
                      Удалить
                    </button>
                  )}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      {data.writable ? (
        <div className={s.composer}>
          <textarea
            value={text}
            rows={1}
            maxLength={2000}
            placeholder={isHost ? "Написать участникам" : "Написать в круг"}
            aria-label="Сообщение в чат круга"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <Button variant="primary" iconOnly aria-label="Отправить" loading={busy} disabled={!text.trim()} onClick={send} icon={<Send size={18} />} />
        </div>
      ) : (
        <p className={s.fine}>
          {data.me?.chat_muted ? "Ведущий временно выключил вам сообщения. Читать чат можно." : "Круг закрыт, чат доступен только для чтения."}
        </p>
      )}
    </div>
  );
}
