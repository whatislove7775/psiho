"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api/client";
import { authApi } from "@/lib/api/endpoints";
import type { AuthResponse } from "@/lib/api/types";
import { homeFor, useAuth } from "@/lib/auth/store";
import { Button, Input } from "@/ui";
import { KeyFriend } from "@/components/illustrations";
import { AuthCard, AuthLinks, AuthShell } from "./AuthShell";
import { FormError } from "./FormError";
import { PasswordInput } from "./PasswordInput";
import { RecoveryKeyReveal } from "./RecoveryKeyReveal";
import s from "./auth.module.css";

type Errors = Partial<Record<"alias" | "recovery_key" | "new_password", string>>;

export function RecoverForm() {
  const router = useRouter();
  const [alias, setAlias] = useState("");
  const [key, setKey] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AuthResponse | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const errs: Errors = {};
    if (!alias.trim()) errs.alias = "Введите имя, которое вам выдали при регистрации.";
    if (key.replace(/[^a-z2-7]/gi, "").length < 20) errs.recovery_key = "В ключе 20 символов: четыре группы по пять.";
    if (password.length < 8) errs.new_password = "Пароль должен быть не короче 8 символов.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const res = await authApi.recover(alias.trim().toLowerCase(), key.trim(), password);
      setPassword("");
      setResult(res);
      window.scrollTo({ top: 0 });
    } catch (err) {
      if (err instanceof ApiError) {
        const f = err.fields;
        const fe: Errors = {
          alias: f.alias?.[0],
          recovery_key: f.recovery_key?.[0],
          new_password: f.new_password?.[0],
        };
        setErrors(fe);
        if (!fe.alias && !fe.recovery_key && !fe.new_password) setError(err.message);
      } else setError("Не получилось восстановить доступ. Попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    return (
      <AuthShell art={<KeyFriend />}>
        <RecoveryKeyReveal
          title="Пароль изменён. Сохраните новый ключ"
          intro="Старый ключ больше не работает. Новый понадобится, если вы снова забудете пароль. Показать его ещё раз мы не сможем."
          alias={result.user.alias}
          recoveryKey={result.recovery_key ?? ""}
          avatar={result.user.avatar_config}
          onContinue={() => {
            useAuth.getState().accept(result);
            router.push(homeFor(result.user.role));
          }}
        />
      </AuthShell>
    );
  }

  return (
    <AuthShell art={<KeyFriend />}>
      <AuthCard
        title="Восстановить доступ"
        sub="Введите имя и ключ восстановления, который вы сохранили при регистрации, и придумайте новый пароль."
      >
        <form className={s.form} onSubmit={submit} noValidate>
          <Input
            label="Имя"
            placeholder="тихий-кит-4821"
            value={alias}
            onChange={(e) => {
              setAlias(e.target.value);
              setErrors((x) => ({ ...x, alias: undefined }));
            }}
            error={errors.alias}
            autoComplete="username"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
          />
          <Input
            label="Ключ восстановления"
            placeholder="ABCDE-FGH23-IJKLM-NOP45"
            value={key}
            onChange={(e) => {
              setKey(e.target.value.toUpperCase());
              setErrors((x) => ({ ...x, recovery_key: undefined }));
            }}
            error={errors.recovery_key}
            hint="Регистр и дефисы не важны."
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            style={{ letterSpacing: "0.06em", fontVariantNumeric: "tabular-nums" }}
          />
          <PasswordInput
            label="Новый пароль"
            hint="Не короче 8 символов."
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setErrors((x) => ({ ...x, new_password: undefined }));
            }}
            error={errors.new_password}
            autoComplete="new-password"
          />
          <FormError>{error}</FormError>
          <Button type="submit" variant="primary" size="lg" block loading={busy}>
            Сменить пароль и войти
          </Button>
        </form>
      </AuthCard>
      <AuthLinks
        links={[
          { href: "/login", label: "Войти", prefix: "Вспомнили пароль?" },
          { href: "/start", label: "Создать новый аккаунт", prefix: "Ключа нет?" },
        ]}
      />
    </AuthShell>
  );
}
