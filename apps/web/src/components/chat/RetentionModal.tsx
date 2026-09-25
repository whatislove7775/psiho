"use client";

import { Infinity as InfinityIcon, Timer } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, Modal } from "@/ui";
import type { Conversation, Retention } from "@/lib/api/chat";
import s from "./chat.module.css";

const OPTIONS: { value: Retention; title: string; text: string; icon: typeof Timer }[] = [
  {
    value: "24h",
    title: "24 часа",
    text: "Каждое новое сообщение, голосовое и файл удаляются у всех через сутки после отправки. Не остаётся следов.",
    icon: Timer,
  },
  {
    value: "forever",
    title: "Бессрочно",
    text: "Сообщения хранятся, пока вы или собеседник их не удалите. Удобно возвращаться к договорённостям и материалам.",
    icon: InfinityIcon,
  },
];

export function RetentionModal({
  open,
  onClose,
  conv,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  conv: Conversation;
  onSave: (r: Retention) => void;
}) {
  const [value, setValue] = useState<Retention>(conv.retention);
  useEffect(() => {
    if (open) setValue(conv.retention);
  }, [open, conv.retention]);
  const who = conv.kind === "specialist_support" ? "специалист" : "клиент";

  return (
    <Modal open={open} onClose={onClose} title="Сколько хранить переписку" width={480}>
      <div className={s.retOptions} role="radiogroup" aria-label="Срок хранения сообщений">
        {OPTIONS.map((o) => {
          const Icon = o.icon;
          const active = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              className={`${s.retOption} ${active ? s.retActive : ""}`}
              disabled={!conv.can_change_retention}
              onClick={() => setValue(o.value)}
            >
              <span className={s.retIcon}>
                <Icon size={20} />
              </span>
              <span>
                <span className={s.retTitle}>
                  {o.title}
                  {conv.retention === o.value && <span className={s.retNow}>сейчас</span>}
                </span>
                <span className={s.retText}>{o.text}</span>
              </span>
            </button>
          );
        })}
      </div>
      <p className={s.modalNote}>
        {conv.can_change_retention
          ? "Новый режим действует для следующих сообщений. Собеседник видит выбранный режим, а в чате появится отметка о смене."
          : `Режим хранения выбирает ${who}. Если нужно, попросите его поменять.`}{" "}
        Любое своё сообщение можно удалить у всех в любой момент.
      </p>
      <div className={s.modalActions}>
        <Button variant="ghost" onClick={onClose}>
          {conv.can_change_retention ? "Отмена" : "Понятно"}
        </Button>
        {conv.can_change_retention && (
          <Button variant="primary" onClick={() => onSave(value)} disabled={value === conv.retention}>
            Сохранить
          </Button>
        )}
      </div>
    </Modal>
  );
}
