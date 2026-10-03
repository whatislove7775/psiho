"use client";

/**
 * Breakout rooms («комнаты») of a circle meeting.
 *  - Moderators (host, co-therapist): split everyone into 2–4 rooms (auto-distributed), then drag a
 *    participant chip onto a room — or select several chips and press a room — to move them; join any
 *    room themselves; optional timer; message to all rooms; bring everyone back.
 *  - Participants see the rooms and where they are; they move themselves only if the host allowed it.
 * Everyone is shown by the circle pseudonym only. Transport: useGroupCall (rooms = separate meshes).
 */
import { t as tt, tj } from "@/lib/i18n";
import { useEffect, useMemo, useState } from "react";
import { DoorOpen, Megaphone, Timer, Undo2 } from "lucide-react";
import { Button, Segmented } from "@/ui";
import { MAIN_ROOM, roomOf, type PeerView, type RoomsState } from "@/hooks/useGroupCall";
import { cx, toneClass } from "./bits";
import s from "./groupRoom.module.css";

type Action = Parameters<ReturnType<typeof import("@/hooks/useGroupCall").useGroupCall>["roomsAction"]>[0];

/** Seconds left on the rooms timer (server clock, skew-corrected), or null. */
export function useRoomsCountdown(rooms: RoomsState): number | null {
  // when this state arrived (server `now` + local elapsed = skew-free countdown)
  const received = useMemo(() => ({ at: Date.now(), rooms }), [rooms]);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!rooms.ends_at) return;
    const t = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [rooms.ends_at]);
  if (!rooms.ends_at || !rooms.rooms.length) return null;
  const left = rooms.ends_at - rooms.now - (Date.now() - received.at) / 1000;
  return Math.max(0, Math.round(left));
}

export function roomName(rooms: RoomsState, id: string): string {
  return id === MAIN_ROOM ? tt("Общий зал") : rooms.rooms.find((r) => r.id === id)?.name ?? tt("Общий зал");
}

export function BreakoutPanel({
  peers,
  selfId,
  selfName,
  rooms,
  isMod,
  onAction,
  onMoveSelf,
}: {
  peers: PeerView[];
  selfId: string | null;
  selfName: string;
  rooms: RoomsState;
  isMod: boolean;
  onAction: (a: Action) => void;
  onMoveSelf: (room: string) => void;
}) {
  const [count, setCount] = useState("2");
  const [minutes, setMinutes] = useState("10");
  const [free, setFree] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [text, setText] = useState("");
  const [over, setOver] = useState<string | null>(null);
  const left = useRoomsCountdown(rooms);
  const open = rooms.rooms.length > 0;

  const everyone = useMemo(
    () => [...(selfId ? [{ id: selfId, name: selfName, role: isMod ? "host" : "member", tone: "primary", me: true }] : []), ...peers.map((p) => ({ ...p, me: false }))],
    [peers, selfId, selfName, isMod],
  );
  const members = peers.filter((p) => p.role === "member");
  const ids = open ? [MAIN_ROOM, ...rooms.rooms.map((r) => r.id)] : [MAIN_ROOM];

  const move = (who: string[], room: string) => {
    if (!who.length) return;
    onAction({ type: "move", peers: who, room });
    setSel(new Set());
  };
  const start = () => {
    const n = +count;
    const assign: Record<string, string> = {};
    // shuffle a bit so it is not always the same pairs
    [...members].sort(() => Math.random() - 0.5).forEach((p, i) => (assign[p.id] = `r${(i % n) + 1}`));
    onAction({
      type: "rooms-open",
      rooms: Array.from({ length: n }, (_, i) => tt(`Комната {v}`, { v: i + 1 })),
      assign,
      minutes: minutes === "0" ? null : +minutes,
      free,
    });
  };

  return (
    <div className={s.rooms}>
      {open && (
        <p className={s.roomsNote}>
          {left !== null ? (
            <>
              <Timer size={14} />{" "}{tt("Осталось")}{" "}{Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
            </>
          ) : (
            tt("Без таймера")
          )}
          {rooms.free ? tt(", можно переходить самим") : ""}
        </p>
      )}
      {ids.map((rid) => {
        const inRoom = everyone.filter((p) => roomOf(rooms, p.id) === rid);
        const here = selfId ? roomOf(rooms, selfId) === rid : false;
        return (
          <section
            key={rid}
            className={cx(s.roomBox, here && s.roomHere, over === rid && s.roomOver)}
            onDragOver={isMod ? (e) => (e.preventDefault(), setOver(rid)) : undefined}
            onDragLeave={isMod ? () => setOver((o) => (o === rid ? null : o)) : undefined}
            onDrop={
              isMod
                ? (e) => {
                    e.preventDefault();
                    setOver(null);
                    const id = e.dataTransfer.getData("text/plain");
                    move(sel.has(id) ? [...sel] : [id], rid);
                  }
                : undefined
            }
            aria-label={roomName(rooms, rid)}
          >
            <header>
              <b>{roomName(rooms, rid)}</b>
              <small>{inRoom.length}</small>
              {here ? (
                <span className={s.roomYou}>{tt("вы здесь")}</span>
              ) : (isMod || (rooms.free && open)) ? (
                <Button size="sm" variant="ghost" icon={<DoorOpen size={15} />} onClick={() => (isMod && selfId ? onAction({ type: "move", peers: [selfId], room: rid }) : onMoveSelf(rid))}>
                  {tt("Зайти")}
                </Button>
              ) : null}
              {isMod && sel.size > 0 && (
                <Button size="sm" variant="secondary" onClick={() => move([...sel], rid)}>
                  {tj("Сюда {size}", { size: sel.size })}
                </Button>
              )}
            </header>
            <div className={s.chips}>
              {inRoom.map((p) => {
                const movable = isMod && !p.me;
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={cx(s.chip, toneClass(p.role === "member" ? p.tone : "primary"), sel.has(p.id) && s.chipSel)}
                    draggable={movable}
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", p.id)}
                    onClick={movable ? () => setSel((x) => {
                      const n = new Set(x);
                      if (n.has(p.id)) n.delete(p.id);
                      else n.add(p.id);
                      return n;
                    }) : undefined}
                    aria-pressed={movable ? sel.has(p.id) : undefined}
                    disabled={!movable}
                  >
                    {p.me ? tt(`{name} (вы)`, { name: p.name }) : p.name}
                  </button>
                );
              })}
              {inRoom.length === 0 && <span className={s.roomEmpty}>{tt("Пусто")}</span>}
            </div>
          </section>
        );
      })}

      {isMod && !open && (
        <div className={s.roomsSetup}>
          <div>
            <div className={s.label}>{tt("Комнат")}</div>
            <Segmented ariaLabel={tt("Сколько комнат")} value={count} onChange={setCount} options={["2", "3", "4"].map((v) => ({ value: v, label: v }))} />
          </div>
          <div>
            <div className={s.label}>{tt("Таймер")}</div>
            <Segmented
              ariaLabel={tt("Таймер")}
              value={minutes}
              onChange={setMinutes}
              options={[
                { value: "0", label: tt("Нет") },
                { value: "5", label: tt("5 мин") },
                { value: "10", label: "10" },
                { value: "15", label: "15" },
              ]}
            />
          </div>
          <label className={s.check}>
            <input type="checkbox" checked={free} onChange={(e) => setFree(e.target.checked)} />{" "}{tt("Участники могут переходить сами")}
          </label>
          <Button variant="primary" block onClick={start} disabled={members.length < 2}>
            {tt("Разделить на\u00a0комнаты")}
          </Button>
          <p className={s.roomsNote}>{tt("Участники распределятся поровну; потом можно перетащить или выбрать нескольких и\u00a0нажать «Сюда».")}</p>
        </div>
      )}

      {isMod && open && (
        <div className={s.roomsSetup}>
          <form
            className={s.broadcast}
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim()) onAction({ type: "broadcast", text: text.trim() });
              setText("");
            }}
          >
            <input value={text} onChange={(e) => setText(e.target.value)} maxLength={300} placeholder={tt("Сообщение во все комнаты")} aria-label={tt("Сообщение во все комнаты")} />
            <Button size="sm" variant="secondary" type="submit" iconOnly aria-label={tt("Отправить во все комнаты")} icon={<Megaphone size={16} />} />
          </form>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button size="sm" variant="ghost" icon={<Timer size={15} />} onClick={() => onAction({ type: "rooms-timer", minutes: Math.max(1, Math.ceil((left ?? 0) / 60)) + 5 })}>
              {tt("+5 минут")}
            </Button>
            <Button size="sm" variant="primary" icon={<Undo2 size={15} />} onClick={() => onAction({ type: "rooms-close" })}>
              {tt("Всех в\u00a0общий зал")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
