"use client";

import { useState, type FormEvent } from "react";
import { Check, LogOut, Minus, Trash2 } from "lucide-react";
import { Button, Card, CardHead, Input, Modal, useToast } from "@/ui";
import { PageHeader, WithRail } from "@/components/shell/AppShell";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { ApiError } from "@/lib/api/client";
import { authApi } from "@/lib/api/endpoints";
import { useAuth } from "@/lib/auth/store";
import { errorText } from "@/components/client/useLoad";
import { AliasCard } from "@/components/client/AliasCard";
import { clientStyles as cs } from "@/components/client/ClientBits";
import s from "./privacy.module.css";

const STORED = [
  { title: "Псевдоним", text: "Случайное имя, по нему вы входите" },
  { title: "Пароль", text: "Только в виде хеша, прочитать его нельзя" },
  { title: "Настройки аватара", text: "Цвета и формы, а не фотография" },
  {
    title: "Записи о сессиях",
    text: "Дата, специалист и сумма, чтобы вы могли войти в звонок",
  },
];
const NOT_STORED = [
  { title: "Имя, телефон и почта", text: "Мы их не спрашиваем" },
  {
    title: "Изображение с камеры",
    text: "Оно превращается в мимику аватара прямо на устройстве",
  },
  { title: "Запись разговора", text: "Звонок идёт напрямую и не сохраняется" },
  {
    title: "Данные карты",
    text: "Их обрабатывает платёжный сервис, у нас их нет",
  },
];

export default function PrivacyPage() {
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
    if (!oldPw) errs.old = "Введите пароль, которым входите сейчас";
    if (newPw.length < 8) errs.next = "Нужно не меньше 8 символов";
    else if (newPw === oldPw) errs.next = "Новый пароль совпадает с текущим";
    if (repeat !== newPw)
      errs.repeat = "Пароли не совпадают. Введите новый пароль ещё раз";
    setPwErr(errs);
    if (Object.keys(errs).length) return;
    setPwBusy(true);
    try {
      await authApi.changePassword(oldPw, newPw);
      setOldPw("");
      setNewPw("");
      setRepeat("");
      toast("Пароль изменён");
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
      setDelErr("Введите пароль, чтобы подтвердить удаление");
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
          ? "Пароль не подошёл. Проверьте раскладку и попробуйте снова"
          : errorText(err),
      );
      setDelBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Приватность"
        sub="Что мы знаем о вас, как защитить доступ и как удалить всё одним действием."
      />
      <WithRail
        rail={
          user ? (
            <div className={s.wideOnly}>
              <AliasCard user={user} />
            </div>
          ) : null
        }
      >
        {user && (
          <div className={s.narrowOnly}>
            <AliasCard user={user} />
          </div>
        )}
        <Card as="section">
          <CardHead
            title="Что мы храним"
            sub="Ровно столько, чтобы сервис работал"
          />
          <div className={s.columns}>
            <div className={s.col}>
              <h3 className={s.colTitle}>Храним</h3>
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
              <h3 className={s.colTitle}>Не храним</h3>
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
        </Card>

        <Card as="section">
          <CardHead
            title="Пароль"
            sub="Если кто-то мог его увидеть, смените прямо сейчас"
          />
          <form className={s.form} onSubmit={changePassword} noValidate>
            <Input
              label="Текущий пароль"
              type="password"
              autoComplete="current-password"
              value={oldPw}
              onChange={(e) => setOldPw(e.target.value)}
              error={pwErr.old}
            />
            <div className={s.pair}>
              <Input
                label="Новый пароль"
                type="password"
                autoComplete="new-password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                error={pwErr.next}
                hint="Не меньше 8 символов"
              />
              <Input
                label="Новый пароль ещё раз"
                type="password"
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
                Сменить пароль
              </Button>
            </div>
          </form>
        </Card>

        <Card as="section">
          <CardHead title="Это устройство" />
          <div className={s.settings}>
            <div className={s.setting}>
              <span>
                <strong>Тема оформления</strong>
                <span>
                  Светлая или тёмная, сохраняется только в этом браузере
                </span>
              </span>
              <ThemeToggle />
            </div>
            <div className={s.setting}>
              <span>
                <strong>Выйти из аккаунта</strong>
                <span>
                  На общем компьютере лучше выходить после каждой сессии
                </span>
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={onLogout}
                icon={<LogOut size={16} strokeWidth={1.8} />}
              >
                Выйти
              </Button>
            </div>
          </div>
        </Card>

        <section className={s.danger} aria-labelledby="danger-title">
          <div>
            <h2 id="danger-title">Удалить аккаунт и все данные</h2>
            <p>
              Псевдоним, аватар и история сессий исчезнут навсегда. Восстановить
              их будет нельзя, даже с ключом.
            </p>
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
            Удалить аккаунт
          </Button>
        </section>
      </WithRail>

      <Modal
        open={delOpen}
        onClose={() => !delBusy && setDelOpen(false)}
        title="Удалить аккаунт навсегда?"
        width={480}
      >
        <form onSubmit={deleteAccount} noValidate>
          <p className={cs.modalText}>
            Мы сотрём псевдоним <strong>{user?.alias}</strong>, аватар и все
            сессии. Запланированные встречи тоже удалятся. Чтобы подтвердить,
            введите пароль.
          </p>
          <div style={{ marginTop: 16 }}>
            <Input
              label="Пароль"
              type="password"
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
              Оставить аккаунт
            </Button>
            <Button type="submit" variant="danger" loading={delBusy}>
              Удалить навсегда
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
