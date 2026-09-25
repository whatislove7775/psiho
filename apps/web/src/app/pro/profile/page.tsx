"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Button, Card, CardHead, Field, Input, Skeleton, Textarea, useToast } from "@/ui";
import { PageHeader, WithRail } from "@/components/shell/AppShell";
import { SpecialistPhoto } from "@/components/avatar/SpecialistPhoto";
import { PhotoUploader } from "@/components/pro/PhotoUploader";
import { ChipsField, LoadError } from "@/components/pro/controls";
import { ApiError } from "@/lib/api/client";
import { cabinetApi } from "@/lib/api/endpoints";
import type { PsychologistPrivate } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/store";
import { plural, rub } from "@/lib/format";
import { durationLabel } from "@/lib/api/availability";
import s from "@/components/pro/pro.module.css";
import c from "./profile.module.css";

const SPECS = [
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
const LANGS = ["Русский", "Английский", "Украинский", "Казахский", "Армянский", "Немецкий"];
const FEE = 0.2;

interface Form {
  display_name: string;
  bio: string;
  approach: string;
  specializations: string[];
  languages: string[];
  experience_years: string;
  session_rate_rub: string;
}
type Errors = Partial<Record<keyof Form, string>>;

const fromProfile = (p: PsychologistPrivate): Form => ({
  display_name: p.display_name ?? "",
  bio: p.bio ?? "",
  approach: p.approach ?? "",
  specializations: p.specializations ?? [],
  languages: p.languages ?? [],
  experience_years: String(p.experience_years ?? ""),
  session_rate_rub: String(p.session_rate_rub ?? ""),
});

function validate(f: Form): Errors {
  const e: Errors = {};
  if (!f.display_name.trim()) e.display_name = "Укажите имя, под которым вас увидят клиенты";
  if (f.bio.trim().length < 40) e.bio = `Напишите хотя бы пару предложений: сейчас ${f.bio.trim().length} из 40 символов`;
  if (!f.specializations.length) e.specializations = "Выберите хотя бы одну тему из подсказок или добавьте свою";
  if (!f.languages.length) e.languages = "Добавьте язык, на котором проводите сессии";
  const exp = Number(f.experience_years);
  if (f.experience_years === "" || !Number.isInteger(exp) || exp < 0 || exp > 70) e.experience_years = "Целое число лет, от 0 до 70";
  return e;
}

export default function ProfilePage() {
  const toast = useToast();
  const refreshUser = useAuth((st) => st.refreshUser);
  const [initial, setInitial] = useState<Form | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [status, setStatus] = useState<PsychologistPrivate["verification_status"] | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [touched, setTouched] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [booking, setBooking] = useState<PsychologistPrivate["booking"]>(undefined);

  const load = useCallback(() => {
    setLoadError(null);
    cabinetApi
      .profile()
      .then((p) => {
        const f = fromProfile(p);
        setInitial(f);
        setForm(f);
        setStatus(p.verification_status);
        setPhoto(p.photo_url ?? null);
        setBooking(p.booking);
      })
      .catch((e) => setLoadError(`${(e as Error).message} Обновите страницу, чтобы загрузить профиль.`));
  }, []);
  useEffect(load, [load]);

  const dirty = useMemo(() => !!form && !!initial && JSON.stringify(form) !== JSON.stringify(initial), [form, initial]);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setForm((f) => {
      if (!f) return f;
      const next = { ...f, [k]: v };
      if (touched) setErrors(validate(next));
      return next;
    });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setTouched(true);
    const errs = validate(form);
    setErrors(errs);
    if (Object.keys(errs).length) {
      toast("Проверьте поля, отмеченные красным", { error: true });
      return;
    }
    setSaving(true);
    try {
      const p = await cabinetApi.updateProfile({
        display_name: form.display_name.trim(),
        bio: form.bio.trim(),
        approach: form.approach.trim(),
        specializations: form.specializations,
        languages: form.languages,
        experience_years: Number(form.experience_years),
      });
      const f = fromProfile(p);
      setInitial(f);
      setForm(f);
      refreshUser().catch(() => {});
      toast("Профиль сохранён");
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) {
        const fe: Errors = {};
        for (const [k, v] of Object.entries(err.fields)) if (k in (form as object)) fe[k as keyof Form] = v[0];
        setErrors(fe);
      }
      toast((err as Error).message, { error: true });
    } finally {
      setSaving(false);
    }
  };


  return (
    <>
      <PageHeader
        title="Профиль"
        sub={
          status === "approved"
            ? "Так клиенты узнают вас в каталоге. Изменения видны сразу после сохранения."
            : "Заполните профиль полностью: администратор смотрит именно его, когда проверяет заявку."
        }
      />
      <WithRail rail={<Preview form={form} photo={photo} />}>
        {loadError && <LoadError text={loadError} onRetry={load} />}
        {!form ? (
          <Card>
            <div style={{ display: "grid", gap: 16 }}>
              {[56, 140, 110, 90].map((h, i) => (
                <Skeleton key={i} height={h} />
              ))}
            </div>
          </Card>
        ) : (
          <form onSubmit={submit} noValidate className={c.form}>
            <span id="photo" style={{ display: "block", scrollMarginTop: 16 }} />
            <Card as="section">
              <CardHead title="Фото" sub="Специалисты на платформе не анонимны: клиенту важно видеть, с кем он говорит" />
              <PhotoUploader
                url={photo}
                name={form.display_name}
                onChange={(u) => {
                  setPhoto(u);
                  refreshUser().catch(() => {});
                }}
              />
            </Card>

            <Card as="section">
              <CardHead title="О вас" sub="Клиенты не видят вашу почту. Имя можно указать полностью или только имя и первую букву фамилии" />
              <div className={c.fields}>
                <Input
                  label="Имя в каталоге"
                  value={form.display_name}
                  maxLength={80}
                  onChange={(e) => set("display_name", e.target.value)}
                  error={errors.display_name}
                  placeholder="Анна Соколова"
                />
                <Textarea
                  label="Коротко о себе"
                  value={form.bio}
                  maxLength={1200}
                  rows={5}
                  onChange={(e) => set("bio", e.target.value)}
                  error={errors.bio}
                  hint={`С чем помогаете и как проходит работа. ${form.bio.length} из 1200`}
                  placeholder="Помогаю разобраться с тревогой и вернуть ощущение опоры…"
                />
                <Textarea
                  label="Подход"
                  value={form.approach}
                  maxLength={600}
                  rows={3}
                  onChange={(e) => set("approach", e.target.value)}
                  error={errors.approach}
                  hint="Методы и школы, в которых вы работаете"
                  placeholder="Когнитивно-поведенческая терапия, элементы ACT"
                />
              </div>
            </Card>

            <Card as="section">
              <CardHead title="С чем работаете" sub="По этим темам клиенты ищут специалиста" />
              <div className={c.fields}>
                <Field label="Специализации" error={errors.specializations}>
                  <ChipsField
                    value={form.specializations}
                    onChange={(v) => set("specializations", v)}
                    suggestions={SPECS}
                    placeholder="Своя тема, например «Эмиграция»"
                    addLabel="Добавить"
                  />
                </Field>
                <Field label="Языки сессий" error={errors.languages}>
                  <ChipsField value={form.languages} onChange={(v) => set("languages", v)} suggestions={LANGS} placeholder="Другой язык" addLabel="Добавить" max={6} />
                </Field>
              </div>
            </Card>

            <Card as="section">
              <CardHead title="Опыт и стоимость" />
              <div className={c.pair}>
                <Input
                  label="Опыт, лет"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={70}
                  value={form.experience_years}
                  onChange={(e) => set("experience_years", e.target.value)}
                  error={errors.experience_years}
                />
                <Field label="Цена часа">
                  <Button variant="secondary" block href="/pro/schedule?tab=rules">
                    {booking ? `${rub(booking.hourly_rate_rub)}, изменить` : "Настроить"}
                  </Button>
                </Field>
              </div>
              <div className={c.prices}>
                {(booking?.durations ?? []).slice(0, 4).map((d) => (
                  <div key={d.minutes} className={c.price}>
                    <span>{durationLabel(d.minutes)}</span>
                    <strong>{rub(d.price_rub)}</strong>
                    <small>Вам {rub(d.price_rub * (1 - FEE))}</small>
                  </div>
                ))}
              </div>
              <p className={c.note}>
                Комиссия платформы 20%. Цена часа, длительность сессий и перерывы настраиваются в расписании. Стоимость сессии
                пропорциональна длительности и округляется до 10 ₽.
              </p>
            </Card>

            <div className={c.bar} data-dirty={dirty || undefined}>
              <span className={s.muted}>{dirty ? "Есть несохранённые изменения" : "Все изменения сохранены"}</span>
              <Button type="submit" variant="primary" size="lg" loading={saving} disabled={!dirty}>
                Сохранить профиль
              </Button>
            </div>
          </form>
        )}
      </WithRail>
    </>
  );
}

function Preview({ form, photo }: { form: Form | null; photo: string | null }) {
  if (!form) return <Skeleton height={420} radius={22} />;
  const exp = Number(form.experience_years) || 0;
  return (
    <div className={c.previewWrap}>
      <div className={c.previewLabel}>Так вас видят клиенты</div>
      <Card as="article" className={c.preview}>
        <div className={c.pHead}>
          <SpecialistPhoto url={photo} name={form.display_name.trim() || "?"} size={72} />
          <div style={{ minWidth: 0 }}>
            <div className={c.pName}>{form.display_name.trim() || "Ваше имя"}</div>
            <div className={c.pMeta}>
              {exp ? `Опыт ${exp} ${plural(exp, "год", "года", "лет")}` : "Опыт не указан"}
              {form.languages.length ? `, ${form.languages.join(", ").toLowerCase()}` : ""}
            </div>
          </div>
        </div>
        {form.specializations.length > 0 && (
          <div className={c.pTags}>
            {form.specializations.slice(0, 5).map((t) => (
              <span key={t}>{t}</span>
            ))}
            {form.specializations.length > 5 && <span>ещё {form.specializations.length - 5}</span>}
          </div>
        )}
        <p className={c.pBio}>{form.bio.trim() || "Здесь будет текст о вас. Клиенты читают его первым, когда выбирают специалиста."}</p>
        {form.approach.trim() && <p className={c.pApproach}>{form.approach.trim()}</p>}
        <div className={c.pFoot}>
          <div>
            <div className={c.pPrice}>{rub(Number(form.session_rate_rub) || 0)}</div>
            <div className={c.pMeta}>самая короткая сессия</div>
          </div>
          <Button variant="primary" size="sm" tabIndex={-1} aria-hidden>
            Записаться
          </Button>
        </div>
      </Card>
      <p className={c.note}>Почта и документы клиентам не показываются. На сессии клиент видит ваше видео с камеры.</p>
    </div>
  );
}
