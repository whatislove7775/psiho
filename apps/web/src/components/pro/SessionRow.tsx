"use client";

import { useState } from "react";
import { Badge, Button, Modal, useToast } from "@/ui";
import { AvatarThumb } from "@/components/avatar/AvatarThumb";
import { sessionsApi } from "@/lib/api/endpoints";
import type { Session } from "@/lib/api/types";
import { rub, SESSION_STATUS, when } from "@/lib/format";
import s from "./pro.module.css";

const CANCELLABLE = new Set(["awaiting_payment", "paid"]);

export function canCancel(x: Session) {
  return CANCELLABLE.has(x.status) && new Date(x.scheduled_at).getTime() > Date.now();
}

/** One session in the specialist's list: who, when, status, money and what can be done. */
export function SessionRow({ session, onChange }: { session: Session; onChange: (s: Session) => void }) {
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState<"cancel" | "complete" | null>(null);
  const st = SESSION_STATUS[session.status] ?? { label: session.status, tone: "neutral" as const };

  const run = async (kind: "cancel" | "complete") => {
    setBusy(kind);
    try {
      const next = kind === "cancel" ? await sessionsApi.cancel(session.id) : await sessionsApi.complete(session.id);
      onChange(next);
      toast(kind === "cancel" ? "Сессия отменена" : "Сессия завершена");
      setConfirm(false);
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={s.row}>
      <AvatarThumb config={session.client.avatar_config} seed={session.client.alias} size={44} />
      <div className={s.rowMain}>
        <div className={s.rowTitle}>{session.client.alias}</div>
        <div className={s.rowMeta}>
          <span>{when(session.scheduled_at)}</span>
          <span>{session.duration_minutes} минут</span>
        </div>
      </div>
      <div className={s.rowSide}>
        <Badge tone={st.tone} dot={session.status === "in_progress"}>
          {st.label}
        </Badge>
        <span className={s.amount}>{rub(session.amount_rub)}</span>
        <div className={s.actions}>
          {session.can_join && (
            <Button size="sm" variant="primary" href={`/room/${session.id}`}>
              Войти
            </Button>
          )}
          {session.status === "in_progress" && (
            <Button size="sm" variant="secondary" loading={busy === "complete"} onClick={() => run("complete")}>
              Завершить
            </Button>
          )}
          {canCancel(session) && (
            <Button size="sm" variant="ghost" onClick={() => setConfirm(true)}>
              Отменить
            </Button>
          )}
        </div>
      </div>

      <Modal open={confirm} onClose={() => setConfirm(false)} title="Отменить созвон?">
        <p className={s.muted} style={{ marginBottom: 20 }}>
          {session.client.alias}, {when(session.scheduled_at).toLowerCase()}. Клиент увидит отмену в своём кабинете, а
          время снова станет свободным для записи.
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <Button variant="ghost" onClick={() => setConfirm(false)}>
            Оставить
          </Button>
          <Button variant="danger" loading={busy === "cancel"} onClick={() => run("cancel")}>
            Отменить созвон
          </Button>
        </div>
      </Modal>
    </div>
  );
}
