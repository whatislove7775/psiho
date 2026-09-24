"use client";

import type { ReactNode } from "react";
import { AlertCircle, CalendarDays, Clock } from "lucide-react";
import { Badge, Button } from "@/ui";
import { AvatarThumb } from "@/components/avatar/AvatarThumb";
import type { Session } from "@/lib/api/types";
import { SESSION_STATUS, rub, when } from "@/lib/format";
import s from "./client.module.css";

/** Inline error with a retry — says what happened and what to do. */
export function ErrorBlock({
  message,
  onRetry,
  title = "Не получилось загрузить",
}: {
  message: string;
  onRetry?: () => void;
  title?: string;
}) {
  return (
    <div className={s.error} role="alert">
      <AlertCircle className={s.errorIcon} size={22} strokeWidth={1.8} />
      <div className={s.errorText}>
        <strong>{title}</strong>
        <span>{message}</span>
      </div>
      {onRetry && (
        <Button size="sm" variant="secondary" onClick={onRetry}>
          Повторить
        </Button>
      )}
    </div>
  );
}

export function SessionRow({
  session,
  actions,
}: {
  session: Session;
  actions?: ReactNode;
}) {
  const st = SESSION_STATUS[session.status] ?? {
    label: session.status,
    tone: "neutral" as const,
  };
  return (
    <div className={s.row}>
      <AvatarThumb
        config={session.psychologist.avatar_config}
        seed={`psy-${session.psychologist.id}`}
        size={56}
      />
      <div className={s.rowMain}>
        <div className={s.rowName}>{session.psychologist.display_name}</div>
        <div className={s.rowMeta}>
          <span>
            <CalendarDays size={14} strokeWidth={1.8} aria-hidden />
            {when(session.scheduled_at)}
          </span>
          <span>
            <Clock size={14} strokeWidth={1.8} aria-hidden />
            {session.duration_minutes} минут
          </span>
        </div>
      </div>
      <div className={s.rowSide}>
        <Badge tone={st.tone} dot>
          {st.label}
        </Badge>
        <span className={s.amount}>{rub(session.amount_rub)}</span>
      </div>
      {actions ? <div className={s.rowActions}>{actions}</div> : <span />}
    </div>
  );
}

export function RowList({ children }: { children: ReactNode }) {
  return <div className={s.rows}>{children}</div>;
}

export const clientStyles = s;
