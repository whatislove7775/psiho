"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ApiError } from "@/lib/api/client";
import { authApi } from "@/lib/api/endpoints";
import { homeFor, useAuth } from "@/lib/auth/store";
import { Button, Input } from "@/ui";
import { AuthCard, AuthLinks, AuthShell, safeNext } from "./AuthShell";
import { FormError } from "./FormError";
import { PasswordInput } from "./PasswordInput";
import s from "./auth.module.css";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      setError("Введите имя или почту и пароль.");
      return;
    }
    setBusy(true);
    try {
      const res = await authApi.login(login.trim(), password);
      useAuth.getState().accept(res);
      router.push(next ?? homeFor(res.user.role));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не получилось войти. Попробуйте ещё раз.");
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <AuthCard
        title="Вход"
        sub={
          <>
            Клиенты входят по имени вроде <span style={{ whiteSpace: "nowrap" }}>«тихий-кит-4821»</span>, специалисты по
            почте.
          </>
        }
      >
        <form className={s.form} onSubmit={submit} noValidate>
          <Input
            label="Имя или почта"
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            autoComplete="username"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="тихий-кит-4821"
            autoFocus
            required
          />
          <PasswordInput
            label="Пароль"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          <FormError>{error}</FormError>
          <Button type="submit" variant="primary" size="lg" block loading={busy}>
            Войти
          </Button>
        </form>
      </AuthCard>
      <AuthLinks
        links={[
          { href: "/recover", label: "Восстановить доступ", prefix: "Забыли пароль?" },
          { href: "/start", label: "Начать анонимно", prefix: "Нет аккаунта?" },
        ]}
      />
    </AuthShell>
  );
}
