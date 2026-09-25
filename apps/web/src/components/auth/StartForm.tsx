"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { authApi } from "@/lib/api/endpoints";
import type { AuthResponse } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/store";
import { Button } from "@/ui";
import { Hello, KeyFriend } from "@/components/illustrations";
import { AuthCard, AuthLinks, AuthShell } from "./AuthShell";
import { FormError } from "./FormError";
import { PasswordInput } from "./PasswordInput";
import { RecoveryKeyReveal } from "./RecoveryKeyReveal";
import s from "./auth.module.css";

export function StartForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AuthResponse | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldError(null);
    if (password.length < 8) {
      setFieldError("Пароль должен быть не короче 8 символов.");
      return;
    }
    setBusy(true);
    try {
      const res = await authApi.anonymous(password);
      setPassword("");
      setResult(res);
      window.scrollTo({ top: 0 });
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : null;
      if (apiErr?.fields.password?.[0]) setFieldError(apiErr.fields.password[0]);
      else setError(apiErr?.message ?? "Не получилось создать аккаунт. Попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    return (
      <AuthShell art={<KeyFriend />}>
        <RecoveryKeyReveal
          alias={result.user.alias}
          recoveryKey={result.recovery_key ?? ""}
          avatar={result.user.avatar_config}
          onContinue={() => {
            useAuth.getState().accept(result);
            router.push("/app/avatar?welcome=1");
          }}
        />
      </AuthShell>
    );
  }

  return (
    <AuthShell art={<Hello />}>
      <AuthCard
        title="Начать анонимно"
        sub="Почта и телефон не нужны. Придумайте пароль, а имя для входа мы создадим сами."
      >
        <form className={s.form} onSubmit={submit} noValidate>
          <PasswordInput
            label="Пароль"
            hint="Не короче 8 символов. Лучше фраза из нескольких слов."
            error={fieldError}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setFieldError(null);
            }}
            autoComplete="new-password"
            autoFocus
            minLength={8}
            maxLength={128}
            required
          />
          <FormError>{error}</FormError>
          <Button type="submit" variant="primary" size="lg" block loading={busy}>
            Создать анонимный аккаунт
          </Button>
        </form>
        <ol className={s.steps} aria-label="Что будет дальше">
          <li>
            <b>1</b>
            <span>Мы создадим имя вроде «тихий-кит-4821» и ключ восстановления. Ключ покажем один раз.</span>
          </li>
          <li>
            <b>2</b>
            <span>Вы соберёте аватар, которым вас будет видеть специалист.</span>
          </li>
          <li>
            <b>3</b>
            <span>Выберете специалиста и время, когда будете готовы.</span>
          </li>
        </ol>
      </AuthCard>
      <div className={s.note}>
        <span className={s.noteIcon} aria-hidden>
          <ShieldCheck size={20} strokeWidth={1.8} />
        </span>
        <span>
          <strong>Что мы будем знать о вас</strong>
          Только имя, зашифрованный пароль и настройки аватара. Удалить аккаунт и всё, что с ним связано, можно в
          настройках в любой момент.
        </span>
      </div>
      <AuthLinks
        links={[
          { href: "/login", label: "Войти", prefix: "Уже есть аккаунт?" },
          { href: "/join", label: "Регистрация специалиста", prefix: "Вы психолог?" },
        ]}
      />
    </AuthShell>
  );
}
