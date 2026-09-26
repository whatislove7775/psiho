"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api/client";
import { authApi } from "@/lib/api/endpoints";
import { useAuth } from "@/lib/auth/store";
import { Button, Input, Textarea } from "@/ui";
import { SpecialistFriend } from "@/components/illustrations";
import { AuthCard, AuthLinks, AuthShell } from "./AuthShell";
import { ChipsInput } from "./ChipsInput";
import { FormError } from "./FormError";
import { PasswordInput } from "./PasswordInput";
import s from "./auth.module.css";
import { ConsentNote } from "@/components/legal/ConsentNote";

const TOPICS = [
  "Тревога",
  "Депрессия",
  "Выгорание",
  "Отношения",
  "Самооценка",
  "Панические атаки",
  "Горе и утрата",
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
    if (!name.trim()) e.display_name = "Напишите, как вас показывать клиентам.";
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) e.email = "Проверьте почту: похоже, в ней опечатка.";
    if (password.length < 8) e.password = "Пароль должен быть не короче 8 символов.";
    if (!topics.length) e.specializations = "Выберите хотя бы одну тему.";
    const y = Number(years);
    if (years === "" || !Number.isInteger(y) || y < 0 || y > 80) e.experience_years = "Укажите опыт целым числом лет.";
    const r = Number(rate);
    if (rate === "" || !Number.isFinite(r) || r <= 0 || r > 1_000_000)
      e.session_rate_rub = "Укажите стоимость созвона в рублях.";
    return e;
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    setError(null);
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) {
      setError("Проверьте отмеченные поля.");
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
      } else setError("Не получилось отправить анкету. Попробуйте ещё раз.");
      setBusy(false);
    }
  };

  return (
    <AuthShell wide art={<SpecialistFriend />}>
      <AuthCard
        title="Анкета специалиста"
        sub="Клиенты приходят анонимно: вы увидите аватар и имя вроде «тихий-кит-4821». Профиль проверяем вручную, статус будет виден в кабинете."
      >
        <form className={s.form} onSubmit={submit} noValidate>
          <h2 className={s.sectionLabel}>Вход</h2>
          <div className={s.grid2}>
            <Input
              label="Почта"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                touch("email");
              }}
              error={errors.email}
              hint="Для входа. Храним только в зашифрованном виде."
              autoComplete="email"
              autoFocus
            />
            <PasswordInput
              label="Пароль"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                touch("password");
              }}
              error={errors.password}
              hint="Не короче 8 символов."
              autoComplete="new-password"
            />
          </div>

          <hr className={s.divider} />
          <h2 className={s.sectionLabel}>Профиль в каталоге</h2>
          <Input
            label="Имя в каталоге"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              touch("display_name");
            }}
            error={errors.display_name}
            hint="Так вас увидят клиенты. Например, «Анна Соколова»."
            maxLength={80}
            autoComplete="name"
          />
          <Textarea
            label="О себе"
            value={bio}
            onChange={(e) => {
              setBio(e.target.value);
              touch("bio");
            }}
            error={errors.bio}
            hint="С чем вы работаете и как проходят встречи. Несколько предложений простым языком."
            maxLength={1200}
            rows={5}
          />
          <ChipsInput
            label="Темы, с которыми работаете"
            value={topics}
            onChange={(v) => {
              setTopics(v);
              touch("specializations");
            }}
            suggestions={TOPICS}
            error={errors.specializations}
            hint="Выберите из списка или напишите свою и нажмите Enter."
          />
          <div className={s.grid2}>
            <Input
              label="Опыт, лет"
              type="number"
              inputMode="numeric"
              min={0}
              max={80}
              value={years}
              onChange={(e) => {
                setYears(e.target.value);
                touch("experience_years");
              }}
              error={errors.experience_years}
            />
            <Input
              label="Стоимость созвона, ₽"
              type="number"
              inputMode="numeric"
              min={0}
              step={100}
              value={rate}
              onChange={(e) => {
                setRate(e.target.value);
                touch("session_rate_rub");
              }}
              error={errors.session_rate_rub}
              hint="За 50 минут."
            />
          </div>
          <FormError>{error}</FormError>
          <Button type="submit" variant="primary" size="lg" block loading={busy}>
            Отправить анкету
          </Button>
          <ConsentNote kind="specialist" action="Отправить анкету" />
        </form>
      </AuthCard>
      <AuthLinks
        links={[
          { href: "/login", label: "Войти", prefix: "Уже зарегистрированы?" },
          { href: "/start", label: "Начать анонимно", prefix: "Ищете психолога?" },
        ]}
      />
    </AuthShell>
  );
}
