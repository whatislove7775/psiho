"use client";

import { t } from "@/lib/i18n";
import { lp } from "@/lib/i18n";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ApiError } from "@/lib/api/client";
import { loginWithOtp, OtpRequiredError } from "@/lib/api/staff";
import { homeFor, useAuth } from "@/lib/auth/store";
import { Button, Input, PasswordInput } from "@/ui";
import { DoorWelcome } from "@/components/illustrations";
import { AuthCard, AuthLinks, AuthShell, safeNext } from "./AuthShell";
import { FormError } from "./FormError";
import s from "./auth.module.css";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Staff accounts with 2FA get a second step: a 6-digit code from the authenticator app
  const [otpStep, setOtpStep] = useState(false);
  const [otp, setOtp] = useState("");

  // Already signed in: go straight where the person was heading.
  useEffect(() => {
    useAuth
      .getState()
      .bootstrap()
      .then(() => {
        const { status, user } = useAuth.getState();
        if (status === "authed" && user) router.replace(next ?? homeFor(user.role));
      });
  }, [next, router]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!login.trim() || !password) {
      setError(t("Введите имя или\u00a0почту и\u00a0пароль."));
      return;
    }
    setBusy(true);
    try {
      const res = await loginWithOtp(login.trim(), password, otpStep ? otp.trim() : undefined);
      useAuth.getState().accept(res);
      router.push(next ?? homeFor(res.user.role));
    } catch (err) {
      if (err instanceof OtpRequiredError) {
        setError(otpStep ? err.message : null);
        setOtpStep(true);
        setOtp("");
        setBusy(false);
        return;
      }
      setError(err instanceof ApiError ? err.message : t("Не\u00a0получилось войти. Попробуйте ещё раз."));
      setBusy(false);
    }
  };

  return (
    <AuthShell art={<DoorWelcome />}>
      <AuthCard
        title={t("Вход")}
        sub={
          <>
            {t("Клиенты входят по\u00a0имени вроде")}{" "}<span style={{ whiteSpace: "nowrap" }}>{t("«тихий-кит-4821»")}</span>{t(", специалисты по\u00a0почте.")}
          </>
        }
      >
        <form className={s.form} onSubmit={submit} noValidate>
          <Input
            label={t("Имя или\u00a0почта")}
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            autoComplete="username"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder={t("тихий-кит-4821")}
            autoFocus
            required
          />
          <PasswordInput
            label={t("Пароль")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          {otpStep && (
            <Input
              label={t("Код из\u00a0приложения-аутентификатора")}
              hint={t("Шесть цифр. Код обновляется каждые 30\u00a0секунд.")}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              autoFocus
            />
          )}
          <FormError>{error}</FormError>
          <Button type="submit" variant="primary" size="lg" block loading={busy}>
            {t("Войти")}
          </Button>
        </form>
      </AuthCard>
      <AuthLinks
        links={[
          { href: lp("/recover"), label: t("Восстановить доступ"), prefix: t("Забыли пароль?") },
          { href: lp("/start"), label: t("Начать анонимно"), prefix: t("Нет аккаунта?") },
        ]}
      />
    </AuthShell>
  );
}
