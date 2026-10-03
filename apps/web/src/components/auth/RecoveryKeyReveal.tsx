"use client";

import { t } from "@/lib/i18n";
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
  title = t("Сохраните ключ восстановления"),
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
    const text = t(`Имя: {alias}\nКлюч восстановления: {recoveryKey}`, { alias, recoveryKey });
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast(t("Имя и\u00a0ключ скопированы"));
      setTimeout(() => setCopied(false), 2400);
    } catch {
      toast(t("Не\u00a0получилось скопировать. Выделите ключ и\u00a0скопируйте вручную."), { error: true });
    }
  };

  const download = () => {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://aprosop.ru";
    const text = [
      t("Aprosop: данные для\u00a0входа"),
      "",
      t(`Имя: {alias}`, { alias }),
      t(`Ключ восстановления: {recoveryKey}`, { recoveryKey }),
      "",
      t(`Войти: {origin}/login`, { origin }),
      t(`Если забыли пароль: {origin}/recover`, { origin }),
      "",
      t("Ключ показывается один раз. Храните файл там, где его не\u00a0увидят другие."),
      t("Пароль в\u00a0этот файл не\u00a0записан."),
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
        t("Это\u00a0единственный способ вернуть доступ, если вы\u00a0забудете пароль. Мы\u00a0храним ключ только в\u00a0зашифрованном виде и\u00a0показать его ещё раз не\u00a0сможем.")
      }
    >
      <div className={s.identity}>
        <AvatarThumb config={avatar ?? null} seed={alias} size={52} />
        <div>
          <small>{t("Ваше имя на\u00a0сервисе, по\u00a0нему вы\u00a0входите")}</small>
          <div className={s.alias}>{alias}</div>
        </div>
      </div>

      <div className={s.keyBox}>
        <span className={s.keyLabel} id="recovery-key-label">
          {t("Ключ восстановления")}
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
            {copied ? t("Скопировано") : t("Скопировать")}
          </Button>
          <Button variant="white" size="sm" onClick={download} icon={<Download size={16} strokeWidth={1.8} />}>
            {t("Скачать как\u00a0файл")}
          </Button>
        </div>
      </div>

      <label className={s.check}>
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        <span>{t("Я\u00a0сохранил ключ")}</span>
      </label>

      <Button variant="primary" size="lg" block disabled={!saved} onClick={onContinue}>
        {t("Продолжить")}
      </Button>
    </AuthCard>
  );
}
