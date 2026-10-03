"use client";

/**
 * Voice-message text (chat):
 *  - <VoiceTranscript> under a voice message: «Расшифровать» shows the text the
 *    sender attached (recognised on THEIR device from the original voice), or,
 *    if there is none, recognises the message on THIS device. Nothing is sent
 *    to the server; an on-device result lives only in this page's memory.
 *  - <VoiceTextToggle> in the recorder: «Текст» — attach a transcript.
 */
import { t as tt } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { Captions } from "lucide-react";
import { attachmentUrl } from "@/lib/api/chat";
import { sttManifest, transcribeBlob } from "@/lib/captions/engine";
import s from "./captions.module.css";

const local = new Map<string, string>(); // on-device results, this page only

export function VoiceTranscript({ messageId, text, tone }: { messageId: string; text?: string | null; tone: "mine" | "theirs" }) {
  const attached = (text ?? "").trim();
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<string | null>(() => attached || local.get(messageId) || null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [canLocal, setCanLocal] = useState(false);
  useEffect(() => {
    if (attached) return;
    let alive = true;
    sttManifest().then((m) => alive && setCanLocal(!!m));
    return () => {
      alive = false;
    };
  }, [attached]);
  useEffect(() => {
    if (attached) setResult(attached);
  }, [attached]);

  if (!attached && !canLocal) return null;

  const run = async () => {
    if (result !== null) {
      setOpen((o) => !o);
      return;
    }
    setOpen(true);
    setBusy(true);
    setFailed(false);
    try {
      const url = await attachmentUrl(messageId);
      const t = await transcribeBlob(await (await fetch(url)).blob());
      local.set(messageId, t);
      setResult(t);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`${s.vt} ${tone === "mine" ? s.vtMine : ""}`}>
      <button type="button" className={s.vtBtn} onClick={run} aria-expanded={open} disabled={busy}>
        {busy ? tt("Расшифровываем…") : open ? tt("Скрыть текст") : tt("Расшифровать")}
      </button>
      {open && !busy && (
        <p className={s.vtText}>
          {failed ? tt("Не получилось расшифровать.") : result ? result : tt("Слов не разобрать.")}
        </p>
      )}
    </div>
  );
}

export function VoiceTextToggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      className={s.vtToggle}
      aria-pressed={on}
      onClick={() => onChange(!on)}
      title={tt("Приложить текст: речь распознаётся на вашем устройстве до изменения голоса")}
    >
      <Captions size={16} />
      {tt("Текст")}
    </button>
  );
}
