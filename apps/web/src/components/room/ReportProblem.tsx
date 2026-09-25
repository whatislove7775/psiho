"use client";

import { useState } from "react";
import { Button, Modal, Textarea, useToast } from "@/ui";
import { ApiError } from "@/lib/api/client";
import { callsApi, type CallIssue, type CallTech } from "@/lib/api/calls";
import s from "./Room.module.css";

export const ISSUES: { value: CallIssue; label: string; client?: boolean }[] = [
  { value: "no_audio", label: "Не слышно собеседника" },
  { value: "echo", label: "Эхо или шум" },
  { value: "voice_breaks", label: "Голос прерывается" },
  { value: "no_video", label: "Нет изображения" },
  { value: "video_freezes", label: "Видео зависает" },
  { value: "avatar_lags", label: "Аватар отстаёт от мимики", client: true },
  { value: "avatar_wrong", label: "Аватар неверно повторяет лицо", client: true },
  { value: "voice_filter", label: "Фильтр голоса звучит плохо", client: true },
  { value: "disconnects", label: "Звонок обрывается" },
  { value: "other", label: "Другое" },
];

export function IssueChips({ value, onChange, isClient }: { value: CallIssue[]; onChange: (v: CallIssue[]) => void; isClient: boolean }) {
  return (
    <div className={s.chips} role="group" aria-label="Что пошло не так">
      {ISSUES.filter((i) => isClient || !i.client).map((i) => {
        const on = value.includes(i.value);
        return (
          <button
            key={i.value}
            type="button"
            className={s.chip}
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== i.value) : [...value, i.value])}
          >
            {i.label}
          </button>
        );
      })}
    </div>
  );
}

/** «Сообщить о проблеме» during a call: issue chips + optional text, with connection numbers attached. */
export function ReportProblem({
  open,
  onClose,
  sessionId,
  isClient,
  tech,
  disabled,
}: {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  isClient: boolean;
  tech: () => CallTech;
  /** lab rooms have no session to attach the report to */
  disabled?: boolean;
}) {
  const toast = useToast();
  const [issues, setIssues] = useState<CallIssue[]>([]);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (disabled) {
      toast("В тестовой комнате жалобы не отправляются. Все цифры видны в ?debug=1.");
      onClose();
      return;
    }
    setBusy(true);
    try {
      await callsApi.feedback(sessionId, { kind: "problem", issues, comment: comment.trim(), tech: tech() });
      toast("Спасибо! Мы посмотрим, что случилось со связью.");
      setIssues([]);
      setComment("");
      onClose();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Не получилось отправить. Попробуйте ещё раз.", { error: true });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Сообщить о проблеме" width={520}>
      <p className={s.note}>
        Отметьте, что мешает. Вместе с сообщением мы отправим только цифры о связи (задержку, потери, кодек), без звука, видео и
        переписки.
      </p>
      <IssueChips value={issues} onChange={setIssues} isClient={isClient} />
      <Textarea label="Подробнее, если хотите" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} rows={3} />
      <div className={s.modalActions}>
        <Button variant="ghost" onClick={onClose}>
          Отмена
        </Button>
        <Button variant="primary" loading={busy} disabled={!issues.length && !comment.trim()} onClick={send}>
          Отправить
        </Button>
      </div>
    </Modal>
  );
}
