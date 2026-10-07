"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { t, lp } from "@/lib/i18n";
import { useAuth } from "@/lib/auth/store";
import { couplesApi, type PairPreview } from "@/lib/api/couples";
import { errorText } from "@/components/client/useLoad";
import { Button, Card, Skeleton } from "@/ui";
import { dayLabel, time } from "@/lib/format";
import s from "./couples.module.css";
export function CoupleInvite() {
  const router = useRouter();
  const { status, user, bootstrap } = useAuth();
  const [token, setToken] = useState<string | null>(null);
  const [preview, setPreview] = useState<PairPreview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setToken(window.location.hash.slice(1));
    void bootstrap();
  }, [bootstrap]);
  useEffect(() => {
    if (!token || status !== "authed" || user?.role !== "client") return;
    let active = true;
    setError("");
    couplesApi
      .preview(token)
      .then((v) => {
        if (active) setPreview(v);
      })
      .catch((e) => {
        if (active) setError(errorText(e));
      });
    return () => {
      active = false;
    };
  }, [token, status, user?.role]);
  async function accept() {
    if (!token) return;
    setBusy(true);
    setError("");
    try {
      const c = await couplesApi.accept(token);
      window.history.replaceState(null, "", window.location.pathname);
      router.replace(`/app/couples/${c.id}`);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  const next = `${encodeURIComponent("/app/couples/invite")}#${token ?? ""}`;
  return (
    <Card className={s.stack}>
      <h1>{t("Приглашение на консультацию для пары")}</h1>
      <p>
        {t(
          "Участвуйте только по собственному желанию. После подтверждения вы войдёте в общую встречу с партнёром и психологом. Ваши личные диалоги останутся отдельными.",
        )}
      </p>
      {token === null || status === "loading" ? (
        <Skeleton height={100} />
      ) : !token ? (
        <p role="alert">
          {t(
            "В ссылке нет приглашения. Попросите партнёра прислать полную ссылку.",
          )}
        </p>
      ) : status !== "authed" ? (
        <div className={s.actions}>
          <Button href={`${lp("/login")}?next=${next}`} variant="secondary">
            {t("Войти")}
          </Button>
          <Button href={`${lp("/start")}?next=${next}`} variant="primary">
            {t("Создать свой анонимный аккаунт")}
          </Button>
        </div>
      ) : user?.role !== "client" ? (
        <p>{t("Приглашение принимается из аккаунта клиента.")}</p>
      ) : preview ? (
        <>
          <h2>{preview.host.name}</h2>
          <p>
            {dayLabel(preview.starts_at)}, {time(preview.starts_at)} —{" "}
            {preview.minutes} {t("мин")}
          </p>
          <p>{t("Встреча уже оплачена. Повторно платить не нужно.")}</p>
          <Button variant="primary" loading={busy} onClick={accept}>
            {t("Добровольно присоединиться к встрече")}
          </Button>
        </>
      ) : !error ? (
        <Skeleton height={100} />
      ) : null}
      {error && <p role="alert">{error}</p>}
    </Card>
  );
}
