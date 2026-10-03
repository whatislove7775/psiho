"use client";

/** Privacy & security settings: what we store, stealth mode, screenshot protection, password, device, delete account.
 *  Shared by /app/profile and the «Приватность» tab. */

import { t } from "@/lib/i18n";
import { useState, type FormEvent } from "react";
import { Check, LogOut, Minus, Trash2 } from "lucide-react";
import { Button, Card, CardHead, CollapsibleCard, Input, Modal, PasswordInput, useToast } from "@/ui";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { CountrySelect, LanguageSelect } from "@/components/i18n/LanguageSwitch";
import { ApiError } from "@/lib/api/client";
import { authApi } from "@/lib/api/endpoints";
import { useAuth } from "@/lib/auth/store";
import { errorText } from "@/components/client/useLoad";
import { clientStyles as cs } from "@/components/client/ClientBits";
import s from "@/app/app/avatar/privacy/privacy.module.css";
import { PrivacySettings } from "@/components/privacy/PrivacySettings";

const STORED = [
  { get title() { return t("Псевдоним"); }, get text() { return t("Случайное имя, по\u00a0нему вы\u00a0входите"); } },
  { get title() { return t("Пароль"); }, get text() { return t("Только в\u00a0виде хеша, прочитать его нельзя"); } },
  { get title() { return t("Настройки аватара"); }, get text() { return t("Цвета и\u00a0формы, а\u00a0не\u00a0фотография"); } },
  {
    get title() { return t("Записи о\u00a0созвонах"); },
    get text() { return t("Дата, специалист и\u00a0сумма, чтобы вы\u00a0могли войти в\u00a0звонок"); },
  },
];
const NOT_STORED = [
  { get title() { return t("Имя, телефон и\u00a0почта"); }, get text() { return t("Мы\u00a0их\u00a0не\u00a0спрашиваем"); } },
  {
    get title() { return t("Изображение с\u00a0камеры"); },
    get text() { return t("Оно превращается в\u00a0мимику аватара прямо на\u00a0устройстве"); },
  },
  { get title() { return t("Запись разговора"); }, get text() { return t("Звонок идёт напрямую и\u00a0не\u00a0сохраняется"); } },
  {
    get title() { return t("Данные карты"); },
    get text() { return t("Их\u00a0обрабатывает платёжный сервис, у\u00a0нас их\u00a0нет"); },
  },
];

export function PrivacyAndSecurity() {
  const toast = useToast();
  const user = useAuth((st) => st.user);
  const logout = useAuth((st) => st.logout);

  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [repeat, setRepeat] = useState("");
  const [pwErr, setPwErr] = useState<{
    old?: string;
    next?: string;
    repeat?: string;
    form?: string;
  }>({});
  const [pwBusy, setPwBusy] = useState(false);

  const [delOpen, setDelOpen] = useState(false);
  const [delPw, setDelPw] = useState("");
  const [delErr, setDelErr] = useState<string | null>(null);
  const [delBusy, setDelBusy] = useState(false);

  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    const errs: typeof pwErr = {};
    if (!oldPw) errs.old = t("Введите пароль, которым входите сейчас");
    if (newPw.length < 8) errs.next = t("Нужно не\u00a0меньше 8\u00a0символов");
    else if (newPw === oldPw) errs.next = t("Новый пароль совпадает с\u00a0текущим");
    if (repeat !== newPw)
      errs.repeat = t("Пароли не\u00a0совпадают. Введите новый пароль ещё раз");
    setPwErr(errs);
    if (Object.keys(errs).length) return;
    setPwBusy(true);
    try {
      await authApi.changePassword(oldPw, newPw);
      setOldPw("");
      setNewPw("");
      setRepeat("");
      toast(t("Пароль изменён"));
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) {
        setPwErr({
          old: err.fields.old_password?.[0],
          next: err.fields.new_password?.[0],
          form: err.fields.non_field_errors?.[0],
        });
      } else if (err instanceof ApiError && err.status === 400) {
        setPwErr({ old: err.message });
      } else setPwErr({ form: errorText(err) });
    } finally {
      setPwBusy(false);
    }
  };

  // Hard navigation: the cabinet guard would otherwise race us to /login.
  const leave = () => window.location.replace("/");

  const onLogout = () => {
    logout();
    leave();
  };

  const deleteAccount = async (e: FormEvent) => {
    e.preventDefault();
    if (!delPw) {
      setDelErr(t("Введите пароль, чтобы подтвердить удаление"));
      return;
    }
    setDelBusy(true);
    setDelErr(null);
    try {
      await authApi.deleteAccount(delPw);
      useAuth.getState().logout();
      leave();
    } catch (err) {
      setDelErr(
        err instanceof ApiError && err.status === 400
          ? t("Пароль не\u00a0подошёл. Проверьте раскладку и\u00a0попробуйте снова")
          : errorText(err),
      );
      setDelBusy(false);
    }
  };

  return (
    <>
        <CollapsibleCard title={t("Что\u00a0мы\u00a0храним")} defaultOpen={false}>
          <div className={s.columns}>
            <div className={s.col}>
              <h3 className={s.colTitle}>{t("Храним")}</h3>
              <ul className={s.list}>
                {STORED.map((x) => (
                  <li key={x.title}>
                    <span className={s.markYes} aria-hidden>
                      <Check size={14} strokeWidth={2.6} />
                    </span>
                    <span>
                      <strong>{x.title}</strong>
                      <span>{x.text}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className={s.col}>
              <h3 className={s.colTitle}>{t("Не\u00a0храним")}</h3>
              <ul className={s.list}>
                {NOT_STORED.map((x) => (
                  <li key={x.title}>
                    <span className={s.markNo} aria-hidden>
                      <Minus size={14} strokeWidth={2.6} />
                    </span>
                    <span>
                      <strong>{x.title}</strong>
                      <span>{x.text}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </CollapsibleCard>

        {/* «Незаметный режим» и «Защита от скриншотов» */}
        <PrivacySettings />

        <CollapsibleCard title={t("Сменить пароль")} defaultOpen={false}>
          <form className={s.form} onSubmit={changePassword} noValidate>
            <PasswordInput
              label={t("Текущий пароль")}
              autoComplete="current-password"
              value={oldPw}
              onChange={(e) => setOldPw(e.target.value)}
              error={pwErr.old}
            />
            <div className={s.pair}>
              <PasswordInput
                label={t("Новый пароль")}
                autoComplete="new-password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                error={pwErr.next}
                hint={t("Не\u00a0меньше 8\u00a0символов")}
              />
              <PasswordInput
                label={t("Новый пароль ещё раз")}
                autoComplete="new-password"
                value={repeat}
                onChange={(e) => setRepeat(e.target.value)}
                error={pwErr.repeat}
              />
            </div>
            {pwErr.form && (
              <p className={s.formErr} role="alert">
                {pwErr.form}
              </p>
            )}
            <div>
              <Button type="submit" variant="primary" loading={pwBusy}>
                {t("Сменить пароль")}
              </Button>
            </div>
          </form>
        </CollapsibleCard>

        <Card as="section">
          <CardHead title={t("Это\u00a0устройство")} />
          <div className={s.settings}>
            <div className={s.setting}>
              <span>
                <strong>{t("Тема оформления")}</strong>
              </span>
              <ThemeToggle />
            </div>
            <div className={s.settingSelects}>
              <LanguageSelect />
              <CountrySelect />
            </div>
            <div className={s.setting}>
              <span>
                <strong>{t("Выйти из\u00a0аккаунта")}</strong>
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={onLogout}
                icon={<LogOut size={16} strokeWidth={1.8} />}
              >
                {t("Выйти")}
              </Button>
            </div>
          </div>
        </Card>

        <section className={s.danger} aria-labelledby="danger-title">
          <div>
            <h2 id="danger-title">{t("Удалить аккаунт и\u00a0все данные")}</h2>
            <p>{t("Восстановить будет нельзя, даже с\u00a0ключом.")}</p>
          </div>
          <Button
            variant="danger"
            icon={<Trash2 size={18} strokeWidth={1.8} />}
            onClick={() => {
              setDelPw("");
              setDelErr(null);
              setDelOpen(true);
            }}
          >
            {t("Удалить аккаунт")}
          </Button>
        </section>

      <Modal
        open={delOpen}
        onClose={() => !delBusy && setDelOpen(false)}
        title={t("Удалить аккаунт навсегда?")}
        width={480}
      >
        <form onSubmit={deleteAccount} noValidate>
          <p className={cs.modalText}>
            {t("Мы\u00a0сотрём псевдоним")}{" "}<strong>{user?.alias}</strong>{t(", аватар, диалоги и\u00a0созвоны. Запланированные созвоны тоже отменятся. Чтобы подтвердить, введите пароль.")}
          </p>
          <div style={{ marginTop: 16 }}>
            <PasswordInput
              label={t("Пароль")}
              autoComplete="current-password"
              value={delPw}
              onChange={(e) => setDelPw(e.target.value)}
              error={delErr ?? undefined}
            />
          </div>
          <div className={cs.modalActions}>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setDelOpen(false)}
              disabled={delBusy}
            >
              {t("Оставить аккаунт")}
            </Button>
            <Button type="submit" variant="danger" loading={delBusy}>
              {t("Удалить навсегда")}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
