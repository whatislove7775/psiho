"use client";

import { t } from "@/lib/i18n";
import { lp } from "@/lib/i18n";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api/client";
import { authApi } from "@/lib/api/endpoints";
import { useAuth } from "@/lib/auth/store";
import { Button, Input, NumberInput, PasswordInput, Textarea } from "@/ui";
import { SpecialistFriend } from "@/components/illustrations";
import { AuthCard, AuthLinks, AuthShell } from "./AuthShell";
import { ChipsInput } from "./ChipsInput";
import { FormError } from "./FormError";
import s from "./auth.module.css";
import { ConsentNote } from "@/components/legal/ConsentNote";

const TOPICS = [
  "Тревога",
  "Депрессия",
  "Выгорание",
  "Отношения",
  "Самооценка",
  "Панические атаки",
  "Горе и\u00a0утрата",
  "Кризисы",
  "Зависимости",
  "Подростки",
  "Семья",
  "Сон",
];

type Key = "email" | "password" | "display_name" | "bio" | "specializations" | "experience_years" | "session_rate_rub";
type Errors = Partial<Record<Key, string>>;

export function JoinForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [topics, setTopics] = useState<string[]>([]);
  const [years, setYears] = useState("");
  const [rate, setRate] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** Editing a field clears its error (and the summary once nothing is left). */
  const touch = (k: Key) =>
    setErrors((e) => {
      if (!e[k]) return e;
      const next = { ...e, [k]: undefined };
      if (!Object.values(next).some(Boolean)) setError(null);
      return next;
    });

  const validate = (): Errors => {
    const e: Errors = {};
    if (!name.trim()) e.display_name = t("Напишите, как\u00a0вас показывать клиентам.");
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) e.email = t("Проверьте почту: похоже, в\u00a0ней опечатка.");
    if (password.length < 8) e.password = t("Пароль должен быть не\u00a0короче 8\u00a0символов.");
    if (!topics.length) e.specializations = t("Выберите хотя\u00a0бы одну тему.");
    const y = Number(years);
    if (years === "" || !Number.isInteger(y) || y < 0 || y > 80) e.experience_years = t("Укажите опыт целым числом лет.");
    const r = Number(rate);
    if (rate === "" || !Number.isFinite(r) || r <= 0 || r > 1_000_000)
      e.session_rate_rub = t("Укажите стоимость созвона в\u00a0рублях.");
    return e;
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    setError(null);
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) {
      setError(t("Проверьте отмеченные поля."));
      return;
    }
    setBusy(true);
    try {
      const res = await authApi.registerPsychologist({
        email: email.trim(),
        password,
        display_name: name.trim(),
        bio: bio.trim(),
        specializations: topics,
        experience_years: Number(years),
        session_rate_rub: Math.round(Number(rate)),
      });
      useAuth.getState().accept(res);
      router.push("/pro");
    } catch (err) {
      if (err instanceof ApiError) {
        const fe: Errors = {};
        for (const k of Object.keys(err.fields) as Key[]) fe[k] = err.fields[k]?.[0];
        setErrors(fe);
        setError(err.message);
      } else setError(t("Не\u00a0получилось отправить анкету. Попробуйте ещё раз."));
      setBusy(false);
    }
  };

  return (
    <AuthShell wide art={<SpecialistFriend />}>
      <AuthCard
        title={t("Анкета специалиста")}
        sub={t("Клиенты приходят анонимно: вы\u00a0увидите аватар и\u00a0имя вроде «тихий-кит-4821». Профиль проверяем вручную, статус будет виден в\u00a0кабинете.")}
      >
        <form className={s.form} onSubmit={submit} noValidate>
          <h2 className={s.sectionLabel}>{t("Вход")}</h2>
          <div className={s.grid2}>
            <Input
              label={t("Почта")}
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                touch("email");
              }}
              error={errors.email}
              hint={t("Для\u00a0входа. Храним только в\u00a0зашифрованном виде.")}
              autoComplete="email"
              autoFocus
            />
            <PasswordInput
              label={t("Пароль")}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                touch("password");
              }}
              error={errors.password}
              hint={t("Не\u00a0короче 8\u00a0символов.")}
              autoComplete="new-password"
            />
          </div>

          <hr className={s.divider} />
          <h2 className={s.sectionLabel}>{t("Профиль в\u00a0каталоге")}</h2>
          <Input
            label={t("Имя в\u00a0каталоге")}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              touch("display_name");
            }}
            error={errors.display_name}
            hint={t("Так вас увидят клиенты. Например, «Анна Соколова».")}
            maxLength={80}
            autoComplete="name"
          />
          <Textarea
            label={t("О\u00a0себе")}
            value={bio}
            onChange={(e) => {
              setBio(e.target.value);
              touch("bio");
            }}
            error={errors.bio}
            hint={t("С\u00a0чем\u00a0вы\u00a0работаете и\u00a0как\u00a0проходят встречи. Несколько предложений простым языком.")}
            maxLength={1200}
            rows={5}
          />
          <ChipsInput
            label={t("Темы, с\u00a0которыми работаете")}
            value={topics}
            onChange={(v) => {
              setTopics(v);
              touch("specializations");
            }}
            suggestions={TOPICS}
            error={errors.specializations}
            hint={t("Выберите из\u00a0списка или\u00a0напишите свою и\u00a0нажмите Enter.")}
          />
          <div className={s.grid2}>
            <NumberInput
              label={t("Опыт, лет")}
              min={0}
              max={80}
              value={years === "" ? null : Number(years)}
              onChange={(v) => {
                setYears(v == null ? "" : String(v));
                touch("experience_years");
              }}
              error={errors.experience_years}
            />
            <NumberInput
              label={t("Стоимость созвона, ₽")}
              min={0}
              step={100}
              value={rate === "" ? null : Number(rate)}
              onChange={(v) => {
                setRate(v == null ? "" : String(v));
                touch("session_rate_rub");
              }}
              error={errors.session_rate_rub}
              hint={t("За\u00a050\u00a0минут.")}
            />
          </div>
          <FormError>{error}</FormError>
          <Button type="submit" variant="primary" size="lg" block loading={busy}>
            {t("Отправить анкету")}
          </Button>
          <ConsentNote kind="specialist" action={t("Отправить анкету")} />
        </form>
      </AuthCard>
      <AuthLinks
        links={[
          { href: lp("/login"), label: t("Войти"), prefix: t("Уже зарегистрированы?") },
          { href: lp("/start"), label: t("Начать анонимно"), prefix: t("Ищете психолога?") },
        ]}
      />
    </AuthShell>
  );
}
