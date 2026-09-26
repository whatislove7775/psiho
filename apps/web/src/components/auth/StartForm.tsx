"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api/client";
import { authApi } from "@/lib/api/endpoints";
import type { AuthResponse } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/store";
import { Button } from "@/ui";
import { Hello, KeyFriend } from "@/components/illustrations";
import { AuthCard, AuthLinks, AuthShell, safeNext } from "./AuthShell";
import { FormError } from "./FormError";
import { PasswordInput } from "./PasswordInput";
import { RecoveryKeyReveal } from "./RecoveryKeyReveal";
import s from "./auth.module.css";
import { ConsentNote } from "@/components/legal/ConsentNote";

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
            // H1: «Подбор по анкете» → «Начать анонимно» brings the person back to their results
            const next = safeNext(new URLSearchParams(window.location.search).get("next"));
            router.push(next && next.startsWith("/app/") ? next : "/app/avatar?welcome=1");
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
          <ConsentNote kind="signup" action="Создать анонимный аккаунт" />
        </form>
      </AuthCard>
      <AuthLinks
        links={[
          { href: "/login", label: "Войти", prefix: "Уже есть аккаунт?" },
          { href: "/join", label: "Регистрация специалиста", prefix: "Вы психолог?" },
        ]}
      />
    </AuthShell>
  );
}
