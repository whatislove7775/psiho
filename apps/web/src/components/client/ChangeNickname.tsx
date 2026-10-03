"use client";

import { t, tj, intlLocale } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { Button, Modal, useToast } from "@/ui";
import { ApiError } from "@/lib/api/client";
import { nicknameApi } from "@/lib/api/nickname";
import { useAuth } from "@/lib/auth/store";
import { NicknameField, type NicknameState } from "@/components/auth/NicknameField";
import s from "./nickname.module.css";

/** Profile → «Сменить ник». Once a day; the old nickname isn't kept anywhere. */
export function ChangeNickname({ open, onClose }: { open: boolean; onClose: () => void }) {
  const user = useAuth((st) => st.user);
  const toast = useToast();
  const [nick, setNick] = useState<NicknameState>({ alias: "", ok: false, custom: false });
  const [nextAt, setNextAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    nicknameApi
      .mine()
      .then((r) => setNextAt(r.next_change_at))
      .catch(() => setNextAt(null));
  }, [open]);

  if (!user) return null;
  const locked = !!nextAt && new Date(nextAt) > new Date();

  const save = async () => {
    if (!nick.ok || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await nicknameApi.change(nick.alias);
      useAuth.setState({ user: r.user });
      toast(t(`Теперь вы\u00a0— {alias}. Входите под\u00a0новым ником`, { alias: r.alias }));
      onClose();
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.fields.alias?.[0] ?? e.message);
        if (e.status === 429) nicknameApi.mine().then((r) => setNextAt(r.next_change_at)).catch(() => {});
      } else setError(t("Не\u00a0получилось сохранить. Попробуйте ещё раз"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t("Сменить ник")} width={440}>
      {locked ? (
        <p className={s.note}>
          {tj("Ник можно менять раз в\u00a0сутки. Следующая смена\u00a0— {v}.", { v: new Date(nextAt!).toLocaleString(intlLocale(), { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) })}
        </p>
      ) : (
        <div className={s.body}>
          <NicknameField key={user.alias} initial={user.alias} onChange={setNick} label={t("Новый ник")} startCustom />
          <p className={s.note}>{t("С\u00a0новым ником вы\u00a0входите в\u00a0аккаунт. Специалисты увидят только его, прежний нигде не\u00a0сохранится. Менять можно раз в\u00a0сутки.")}</p>
          {error && (
            <p className={s.error} role="alert">
              {error}
            </p>
          )}
          <div className={s.actions}>
            <Button variant="ghost" onClick={onClose}>
              {t("Отмена")}
            </Button>
            <Button variant="primary" onClick={save} loading={busy} disabled={!nick.ok}>
              {t("Сохранить")}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
