"use client";

import { t } from "@/lib/i18n";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api/client";
import { nicknameApi } from "@/lib/api/nickname";
import type { AuthResponse } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/store";
import { Button, PasswordInput } from "@/ui";
import { Hello, KeyFriend } from "@/components/illustrations";
import { AuthCard, AuthLinks, AuthShell, safeNext } from "./AuthShell";
import { FormError } from "./FormError";
import { NicknameField, type NicknameState } from "./NicknameField";
import { RecoveryKeyReveal } from "./RecoveryKeyReveal";
import s from "./auth.module.css";
import { ConsentNote } from "@/components/legal/ConsentNote";
import { useCountry } from "@/lib/i18n/client";
import { lp } from "@/lib/i18n";
import { needsExplicitHealthConsent } from "@/lib/i18n/countries";

export function StartForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [nick, setNick] = useState<NicknameState>({ alias: "", ok: true, custom: false });
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AuthResponse | null>(null);
  const country = useCountry();
  const [adult, setAdult] = useState(false);
  const [health, setHealth] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);
  const explicit = needsExplicitHealthConsent(country.code);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldError(null);
    if (nick.custom && !nick.ok) {
      setError(nick.alias ? t("Выберите другой ник или\u00a0сгенерируйте его.") : t("Введите ник или\u00a0сгенерируйте его."));
      return;
    }
    if (password.length < 8) {
      setFieldError(t("Пароль должен быть не\u00a0короче 8\u00a0символов."));
      return;
    }
    if (!adult) {
      setConsentError(t("Подтвердите, что\u00a0вам есть 18\u00a0лет."));
      return;
    }
    if (explicit && !health) {
      setConsentError(t("Нужно явное согласие на\u00a0обработку сведений о\u00a0здоровье."));
      return;
    }
    setBusy(true);
    try {
      const res = await nicknameApi.signup(password, nick.alias || undefined, {
        adult: true,
        ...(explicit ? { health_data_consent: true } : {}),
        country: country.code,
      });
      setPassword("");
      setResult(res);
      window.scrollTo({ top: 0 });
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : null;
      if (apiErr?.fields.password?.[0]) setFieldError(apiErr.fields.password[0]);
      else if (apiErr?.fields.alias?.[0]) setError(t(`Ник: {v}`, { v: apiErr.fields.alias[0] }));
      else setError(apiErr?.message ?? t("Не\u00a0получилось создать аккаунт. Попробуйте ещё раз."));
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
        title={t("Начать анонимно")}
        sub={t("Почта и\u00a0телефон не\u00a0нужны\u00a0— только ник и\u00a0пароль.")}
      >
        <form className={s.form} onSubmit={submit} noValidate>
          <NicknameField onChange={setNick} />
          <PasswordInput
            label={t("Пароль")}
            hint={t("Не\u00a0короче 8\u00a0символов. Лучше фраза из\u00a0нескольких слов.")}
            error={fieldError}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setFieldError(null);
            }}
            autoComplete="new-password"
            minLength={8}
            maxLength={128}
            required
          />
          <label className={s.check}>
            <input
              type="checkbox"
              checked={adult}
              onChange={(e) => {
                setAdult(e.target.checked);
                setConsentError(null);
              }}
            />
            <span>
              {t("Мне есть 18\u00a0лет")}
              <small>{t("Если вы\u00a0младше, позвоните на\u00a0детский телефон доверия своей страны.")}</small>
            </span>
          </label>
          {explicit && (
            <label className={s.check}>
              <input
                type="checkbox"
                checked={health}
                onChange={(e) => {
                  setHealth(e.target.checked);
                  setConsentError(null);
                }}
              />
              <span>
                {t("Я\u00a0даю явное согласие на\u00a0обработку сведений о\u00a0моём здоровье, которые могут появиться в\u00a0переписке и\u00a0на\u00a0созвонах")}
              </span>
            </label>
          )}
          <FormError>{consentError ?? error}</FormError>
          <Button type="submit" variant="primary" size="lg" block loading={busy}>
            {t("Создать анонимный аккаунт")}
          </Button>
          <ConsentNote kind="signup" action={t("Создать анонимный аккаунт")} />
        </form>
      </AuthCard>
      <AuthLinks
        links={[
          { href: lp("/login"), label: t("Войти"), prefix: t("Уже есть аккаунт?") },
          { href: lp("/join"), label: t("Регистрация специалиста"), prefix: t("Вы\u00a0психолог?") },
        ]}
      />
    </AuthShell>
  );
}
