"use client";

import { t } from "@/lib/i18n";
import { lp } from "@/lib/i18n";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api/client";
import { authApi } from "@/lib/api/endpoints";
import type { AuthResponse } from "@/lib/api/types";
import { homeFor, useAuth } from "@/lib/auth/store";
import { Button, Input, PasswordInput } from "@/ui";
import { KeyFriend } from "@/components/illustrations";
import { AuthCard, AuthLinks, AuthShell } from "./AuthShell";
import { FormError } from "./FormError";
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
    if (!alias.trim()) errs.alias = t("Введите имя, которое вам выдали при\u00a0регистрации.");
    if (key.replace(/[^a-z2-7]/gi, "").length < 20) errs.recovery_key = t("В\u00a0ключе 20\u00a0символов: четыре группы по\u00a0пять.");
    if (password.length < 8) errs.new_password = t("Пароль должен быть не\u00a0короче 8\u00a0символов.");
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
      } else setError(t("Не\u00a0получилось восстановить доступ. Попробуйте ещё раз."));
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    return (
      <AuthShell art={<KeyFriend />}>
        <RecoveryKeyReveal
          title={t("Пароль изменён. Сохраните новый ключ")}
          intro={t("Старый ключ больше не\u00a0работает. Новый понадобится, если вы\u00a0снова забудете пароль. Показать его ещё раз мы\u00a0не\u00a0сможем.")}
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
        title={t("Восстановить доступ")}
        sub={t("Введите имя и\u00a0ключ восстановления, который вы\u00a0сохранили при\u00a0регистрации, и\u00a0придумайте новый пароль.")}
      >
        <form className={s.form} onSubmit={submit} noValidate>
          <Input
            label={t("Имя")}
            placeholder={t("тихий-кит-4821")}
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
            label={t("Ключ восстановления")}
            placeholder="ABCDE-FGH23-IJKLM-NOP45"
            value={key}
            onChange={(e) => {
              setKey(e.target.value.toUpperCase());
              setErrors((x) => ({ ...x, recovery_key: undefined }));
            }}
            error={errors.recovery_key}
            hint={t("Регистр и\u00a0дефисы не\u00a0важны.")}
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            style={{ letterSpacing: "0.06em", fontVariantNumeric: "tabular-nums" }}
          />
          <PasswordInput
            label={t("Новый пароль")}
            hint={t("Не\u00a0короче 8\u00a0символов.")}
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
            {t("Сменить пароль и\u00a0войти")}
          </Button>
        </form>
      </AuthCard>
      <AuthLinks
        links={[
          { href: lp("/login"), label: t("Войти"), prefix: t("Вспомнили пароль?") },
          { href: lp("/start"), label: t("Создать новый аккаунт"), prefix: t("Ключа нет?") },
        ]}
      />
    </AuthShell>
  );
}
