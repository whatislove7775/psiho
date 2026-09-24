"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Download } from "lucide-react";
import { AvatarThumb } from "@/components/avatar/AvatarThumb";
import type { AvatarConfig } from "@/lib/avatar/schema";
import { Button, useToast } from "@/ui";
import { AuthCard } from "./AuthShell";
import s from "./auth.module.css";

/**
 * One-time screen with the alias and recovery key. The person must confirm
 * they saved the key before continuing; leaving the tab earlier asks first.
 */
export function RecoveryKeyReveal({
  alias,
  recoveryKey,
  avatar,
  title = "Сохраните ключ восстановления",
  intro,
  onContinue,
}: {
  alias: string;
  recoveryKey: string;
  avatar?: AvatarConfig | null;
  title?: string;
  intro?: string;
  onContinue: () => void;
}) {
  const toast = useToast();
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const groups = recoveryKey.split("-").filter(Boolean);

  useEffect(() => {
    if (saved) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saved]);

  const copy = async () => {
    const text = `Имя: ${alias}\nКлюч восстановления: ${recoveryKey}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast("Имя и ключ скопированы");
      setTimeout(() => setCopied(false), 2400);
    } catch {
      toast("Не получилось скопировать. Выделите ключ и скопируйте вручную.", { error: true });
    }
  };

  const download = () => {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://aprosop.ru";
    const text = [
      "aprosop: данные для входа",
      "",
      `Имя: ${alias}`,
      `Ключ восстановления: ${recoveryKey}`,
      "",
      `Войти: ${origin}/login`,
      `Если забыли пароль: ${origin}/recover`,
      "",
      "Ключ показывается один раз. Храните файл там, где его не увидят другие.",
      "Пароль в этот файл не записан.",
      "",
    ].join("\r\n");
    const blob = new Blob(["﻿" + text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "aprosop-recovery-key.txt";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      a.remove();
      URL.revokeObjectURL(url);
    }, 1500);
  };

  return (
    <AuthCard
      title={title}
      sub={
        intro ??
        "Это единственный способ вернуть доступ, если вы забудете пароль. Мы храним ключ только в зашифрованном виде и показать его ещё раз не сможем."
      }
    >
      <div className={s.identity}>
        <AvatarThumb config={avatar ?? null} seed={alias} size={52} />
        <div>
          <small>Ваше имя на сервисе, по нему вы входите</small>
          <div className={s.alias}>{alias}</div>
        </div>
      </div>

      <div className={s.keyBox}>
        <span className={s.keyLabel} id="recovery-key-label">
          Ключ восстановления
        </span>
        <div className={s.key} aria-labelledby="recovery-key-label" role="group">
          <span className="visually-hidden">{recoveryKey}</span>
          {groups.map((g, i) => (
            <span key={i} aria-hidden>
              {g}
            </span>
          ))}
        </div>
        <div className={s.keyActions}>
          <Button
            variant="white"
            size="sm"
            onClick={copy}
            icon={copied ? <Check size={16} strokeWidth={2} /> : <Copy size={16} strokeWidth={1.8} />}
          >
            {copied ? "Скопировано" : "Скопировать"}
          </Button>
          <Button variant="white" size="sm" onClick={download} icon={<Download size={16} strokeWidth={1.8} />}>
            Скачать как файл
          </Button>
        </div>
      </div>

      <label className={s.check}>
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        <span>Я сохранил ключ</span>
      </label>

      <Button variant="primary" size="lg" block disabled={!saved} onClick={onContinue}>
        Продолжить
      </Button>
    </AuthCard>
  );
}
