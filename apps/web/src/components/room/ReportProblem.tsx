"use client";

import { useState } from "react";
import { Button, Modal, Textarea, useToast } from "@/ui";
import { ApiError } from "@/lib/api/client";
import { callsApi, type CallIssue, type CallTech } from "@/lib/api/calls";
import s from "./Room.module.css";

export const ISSUES: { value: CallIssue; label: string; client?: boolean }[] = [
  { value: "no_audio", label: "Не\u00a0слышно собеседника" },
  { value: "echo", label: "Эхо или\u00a0шум" },
  { value: "voice_breaks", label: "Голос прерывается" },
  { value: "no_video", label: "Нет изображения" },
  { value: "video_freezes", label: "Видео зависает" },
  { value: "avatar_lags", label: "Аватар отстаёт от\u00a0мимики", client: true },
  { value: "avatar_wrong", label: "Аватар неверно повторяет лицо", client: true },
  { value: "voice_filter", label: "Фильтр голоса звучит плохо", client: true },
  { value: "disconnects", label: "Звонок обрывается" },
  { value: "other", label: "Другое" },
];

export function IssueChips({ value, onChange, isClient }: { value: CallIssue[]; onChange: (v: CallIssue[]) => void; isClient: boolean }) {
  return (
    <div className={s.chips} role="group" aria-label="Что&nbsp;пошло не&nbsp;так">
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
  className,
}: {
  className?: string;
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
      toast("В\u00a0тестовой комнате жалобы не\u00a0отправляются. Все цифры видны в\u00a0?debug=1.");
      onClose();
      return;
    }
    setBusy(true);
    try {
      await callsApi.feedback(sessionId, { kind: "problem", issues, comment: comment.trim(), tech: tech() });
      toast("Спасибо! Мы\u00a0посмотрим, что\u00a0случилось со\u00a0связью.");
      setIssues([]);
      setComment("");
      onClose();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Не\u00a0получилось отправить. Попробуйте ещё раз.", { error: true });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Сообщить о&nbsp;проблеме" width={520} className={className}>
      <p className={s.note}>
        Отметьте, что&nbsp;мешает. Вместе с&nbsp;сообщением мы&nbsp;отправим только цифры о&nbsp;связи (задержку, потери, кодек), без&nbsp;звука, видео и&nbsp;переписки.
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
