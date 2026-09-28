"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, ScanFace } from "lucide-react";
import { Button, Card, CardHead, Modal, useToast } from "@/ui";
import { CameraCapture } from "@/components/media/CameraCapture";
import { selfieApi, type SelfieState } from "@/lib/api/authoring";
import s from "./selfie.module.css";

const fmt = (iso: string) => new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });

/**
 * Live verification selfie in the specialist profile (camera only, no file upload):
 * frame 1 looking straight, frame 2 after a random hint («Улыбнитесь», «Поверните голову»).
 * Only staff who verify profiles see it; deleted N days after approval.
 */
export function SelfieStep({ approved }: { approved: boolean }) {
  const toast = useToast();
  const [state, setState] = useState<SelfieState | null>(null);
  const [open, setOpen] = useState(false);
  const [frames, setFrames] = useState<Blob[] | null>(null);
  const [urls, setUrls] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => selfieApi.state().then(setState).catch(() => {}), []);
  useEffect(() => void load(), [load]);
  useEffect(() => {
    const u = (frames ?? []).map((b) => URL.createObjectURL(b));
    setUrls(u);
    return () => u.forEach((x) => URL.revokeObjectURL(x));
  }, [frames]);

  if (!state || (approved && !state.taken_at)) return null;
  const days = state.retention_days;

  // Approved: one quiet line about deletion
  if (approved) {
    return (
      <p className={s.quiet}>
        <ScanFace size={14} aria-hidden /> Селфи для&nbsp;проверки удалится {state.delete_after ? fmt(state.delete_after) : `через ${days} дней`}.
      </p>
    );
  }

  const start = async () => {
    setFrames(null);
    await load(); // fresh hint for the second frame
    setOpen(true);
  };

  const send = async () => {
    if (!frames || !state.challenge) return;
    setBusy(true);
    try {
      const next = await selfieApi.upload(frames[0], frames[1], state.challenge.code);
      setState({ ...next, challenge: undefined });
      setOpen(false);
      setFrames(null);
      toast("Селфи отправлено на\u00a0проверку");
      void load();
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card as="section">
      <CardHead
        title="Селфи для&nbsp;проверки"
        sub={`Два кадра с\u00a0камеры, прямо здесь. Видят только сотрудники, которые проверяют анкету; удалим через ${days} дней после одобрения.`}
      />
      <div className={s.row}>
        {state.taken_at ? (
          <span className={s.done}>
            <Check size={16} aria-hidden /> Сделано {fmt(state.taken_at)}
          </span>
        ) : (
          <span className={s.todo}>Нужно для&nbsp;одобрения профиля</span>
        )}
        <Button type="button" variant={state.taken_at ? "ghost" : "primary"} size="sm" icon={<ScanFace size={16} />} onClick={start}>
          {state.taken_at ? "Переснять" : "Сделать селфи"}
        </Button>
      </div>

      <Modal open={open} onClose={() => !busy && setOpen(false)} title="Селфи для&nbsp;проверки" width={480}>
        {open && !frames && state.challenge && (
          <CameraCapture
            mask="oval"
            steps={[{ hint: "Лицо\u00a0— в\u00a0овале, смотрите в\u00a0камеру" }, { hint: state.challenge.text, countdown: 3 }]}
            onCancel={() => setOpen(false)}
            onDone={setFrames}
          />
        )}
        {frames && (
          <div className={s.review}>
            <div className={s.frames}>
              {urls.map((u, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={u} src={u} alt={i === 0 ? "Кадр 1" : "Кадр 2"} />
              ))}
            </div>
            <p className={s.note}>Лицо хорошо видно на&nbsp;обоих кадрах? Файлы нельзя загрузить&nbsp;— только снять камерой.</p>
            <div className={s.actions}>
              <Button type="button" variant="ghost" onClick={start} disabled={busy}>
                Переснять
              </Button>
              <Button type="button" variant="primary" onClick={send} loading={busy}>
                Отправить
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </Card>
  );
}
