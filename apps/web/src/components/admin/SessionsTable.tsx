"use client";

import { Badge } from "@/ui";
import { AvatarThumb } from "@/components/avatar/AvatarThumb";
import { SpecialistPhoto } from "@/components/avatar/SpecialistPhoto";
import type { Session } from "@/lib/api/types";
import { rub, SESSION_STATUS, dayShort, time } from "@/lib/format";
import s from "./admin.module.css";

/** Table on wide screens, stacked rows on phones. */
export function SessionsTable({ sessions, compact }: { sessions: Session[]; compact?: boolean }) {
  return (
    <div className={s.table} role="table" aria-label="Сессии" data-compact={compact || undefined}>
      <div className={s.thead} role="row">
        <span role="columnheader">Дата</span>
        <span role="columnheader">Специалист</span>
        <span role="columnheader">Клиент</span>
        <span role="columnheader">Статус</span>
        <span role="columnheader" className={s.num}>
          Сумма
        </span>
      </div>
      {sessions.map((x) => {
        const st = SESSION_STATUS[x.status] ?? { label: x.status, tone: "neutral" as const };
        return (
          <div key={x.id} className={s.tr} role="row">
            <span role="cell" className={s.date}>
              <strong>{dayShort(x.scheduled_at)}</strong>
              <span>
                {time(x.scheduled_at)}, {x.duration_minutes} мин
              </span>
            </span>
            <span role="cell" className={s.who}>
              <SpecialistPhoto url={x.psychologist.photo_url} name={x.psychologist.display_name} size={28} />
              <span>{x.psychologist.display_name}</span>
            </span>
            <span role="cell" className={s.who}>
              <AvatarThumb config={x.client.avatar_config} seed={x.client.alias} size={28} />
              <span>{x.client.alias}</span>
            </span>
            <span role="cell" className={s.status}>
              <Badge tone={st.tone}>{st.label}</Badge>
            </span>
            <span role="cell" className={`${s.num} ${s.amount}`}>
              {rub(x.amount_rub)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
