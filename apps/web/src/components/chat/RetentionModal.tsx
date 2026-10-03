"use client";

import { t } from "@/lib/i18n";
import { Hourglass, Infinity as InfinityIcon, Timer } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, Modal } from "@/ui";
import type { Conversation, Retention } from "@/lib/api/chat";
import s from "./chat.module.css";

const OPTIONS: { value: Retention; title: string; text: string; icon: typeof Timer }[] = [
  {
    value: "forever",
    get title() { return t("Выкл\u00a0— хранить всегда"); },
    get text() { return t("Сообщения хранятся, пока вы\u00a0или\u00a0собеседник их\u00a0не\u00a0удалите. Удобно возвращаться к\u00a0договорённостям и\u00a0материалам."); },
    icon: InfinityIcon,
  },
  {
    value: "24h",
    get title() { return t("1\u00a0день"); },
    get text() { return t("Каждое новое сообщение, голосовое и\u00a0файл исчезают у\u00a0обоих через сутки после отправки."); },
    icon: Timer,
  },
  {
    value: "1h",
    get title() { return t("1\u00a0час"); },
    get text() { return t("Новые сообщения исчезают у\u00a0обоих через час после отправки. Для\u00a0самых личных разговоров."); },
    icon: Hourglass,
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
  const who = conv.kind === "specialist_support" ? t("специалист") : t("клиент");

  return (
    <Modal open={open} onClose={onClose} title={t("Исчезающие сообщения")} width={480}>
      <div className={s.retOptions} role="radiogroup" aria-label={t("Исчезающие сообщения")}>
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
                  {conv.retention === o.value && <span className={s.retNow}>{t("сейчас")}</span>}
                </span>
                <span className={s.retText}>{o.text}</span>
              </span>
            </button>
          );
        })}
      </div>
      <p className={s.modalNote}>
        {conv.can_change_retention
          ? t("Режим действует для\u00a0новых сообщений\u00a0— уже отправленные не\u00a0меняются. Собеседник увидит в\u00a0чате отметку о\u00a0смене.")
          : t(`Этот режим выбирает {who}. Если нужно, попросите его поменять.`, { who })}{" "}
        {t("Любое своё сообщение можно удалить у\u00a0всех в\u00a0любой момент.")}
      </p>
      <div className={s.modalActions}>
        <Button variant="ghost" onClick={onClose}>
          {conv.can_change_retention ? t("Отмена") : t("Понятно")}
        </Button>
        {conv.can_change_retention && (
          <Button variant="primary" onClick={() => onSave(value)} disabled={value === conv.retention}>
            {t("Сохранить")}
          </Button>
        )}
      </div>
    </Modal>
  );
}
