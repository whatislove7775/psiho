"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { KeyRound } from "lucide-react";
import { Button, Card, CardHead, Input, Spinner, useToast } from "@/ui";
import { ApiError } from "@/lib/api/client";
import { businessApi, type PortalMe } from "@/lib/api/business";
import { useLoad } from "@/components/client/useLoad";
import { ErrorBlock } from "@/components/client/ClientBits";
import { PageHeader } from "@/components/shell/AppShell";
import s from "./business.module.css";

const Ctx = createContext<PortalMe | null>(null);

/** Company + HR context for portal pages (loaded once in the layout). */
export function usePortal(): PortalMe {
  const v = useContext(Ctx);
  if (!v) throw new Error("usePortal outside PortalGate");
  return v;
}

/** Loads the HR account; a one-time password must be changed before anything else. */
export function PortalGate({ children }: { children: ReactNode }) {
  const me = useLoad(() => businessApi.portalMe(), []);
  if (me.error) return <ErrorBlock message={me.error} onRetry={me.reload} />;
  if (!me.data)
    return (
      <div style={{ display: "grid", placeItems: "center", minHeight: 240 }}>
        <Spinner />
      </div>
    );
  if (me.data.must_change_password) return <ChangePassword onDone={me.reload} />;
  return <Ctx.Provider value={me.data}>{children}</Ctx.Provider>;
}

function ChangePassword({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const [old, setOld] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== again) {
      setError("Пароли не совпадают.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await businessApi.changePassword(old, next);
      toast("Пароль сохранён");
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не получилось сменить пароль.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Добро пожаловать" sub="Вы вошли по одноразовому паролю от менеджера aprosop. Придумайте свой, чтобы продолжить." />
      <Card as="section" style={{ maxWidth: 520 }}>
        <CardHead title="Новый пароль" icon={<KeyRound size={18} />} sub="Не короче 10 символов" />
        <form className={s.form} onSubmit={submit}>
          <Input label="Одноразовый пароль" type="password" value={old} onChange={(e) => setOld(e.target.value)} autoComplete="current-password" />
          <Input label="Новый пароль" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
          <Input
            label="Новый пароль ещё раз"
            type="password"
            value={again}
            onChange={(e) => setAgain(e.target.value)}
            autoComplete="new-password"
            error={error ?? undefined}
          />
          <Button type="submit" variant="primary" loading={busy} disabled={!old || next.length < 10}>
            Сохранить пароль
          </Button>
        </form>
      </Card>
    </>
  );
}
