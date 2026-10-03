"use client";

/**
 * «Подбор специалиста»: 5 short questions → top specialists with a score and a human «why».
 * Used in the cabinet (/app/match) and publicly (/match, no login). Answers stay in this browser only.
 */
import { useCountry } from "@/lib/i18n/client";
import { t as tt, tj, intlLocale, translatedList } from "@/lib/i18n";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CalendarClock,
  Check,
  ChevronDown,
  LifeBuoy,
  MessageCircle,
  Phone,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Button, Modal, Segmented, Skeleton, useToast } from "@/ui";
import { SpecialistPhoto } from "@/components/avatar/SpecialistPhoto";
import { RatingPill } from "@/components/reviews/ReviewBits";
import { ApiError } from "@/lib/api/client";
import { dialogsApi } from "@/lib/api/dialogs";
import {
  DURATIONS,
  EMPTY_ANSWERS,
  INTENSITY,
  SAFETY,
  STYLES,
  TIMES,
  TOPICS,
  clearQuiz,
  loadQuiz,
  matchingApi,
  saveQuiz,
  type MatchAnswers,
  type MatchResponse,
  type MatchResult,
} from "@/lib/api/matching";
import { useAuth } from "@/lib/auth/store";
import { dayLabel, plural, rub, time } from "@/lib/format";
import { IntroChip } from "./IntroChip";
import s from "./matching.module.css";

const STEPS = translatedList(["Что\u00a0беспокоит", "Как\u00a0давно", "Стиль работы", "Пожелания", "Время"] as const);
const PAGE = 3;
const nf = { format: (n: number) => new Intl.NumberFormat(intlLocale()).format(n) };

export function MatchQuiz({ mode }: { mode: "app" | "public" }) {
  const router = useRouter();
  const toast = useToast();
  const authStatus = useAuth((st) => st.status);
  const role = useAuth((st) => st.user?.role);
  const [answers, setAnswers] = useState<MatchAnswers>(EMPTY_ANSWERS);
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState<"quiz" | "results">("quiz");
  const [data, setData] = useState<MatchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const [gate, setGate] = useState<MatchResult | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [restored, setRestored] = useState(false);

  const run = async (a: MatchAnswers) => {
    setPhase("results");
    setLoading(true);
    setError(null);
    setShown(PAGE);
    try {
      setData(await matchingApi.match(a));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : tt("Не\u00a0получилось подобрать специалистов. Попробуйте ещё раз."));
    } finally {
      setLoading(false);
    }
  };

  // Come back later (or after «Начать анонимно»): answers are kept in this browser only
  useEffect(() => {
    const saved = loadQuiz();
    if (saved) {
      setAnswers(saved.answers);
      if (saved.done) void run(saved.answers);
    }
    setRestored(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (restored && phase === "quiz") saveQuiz(answers, false);
  }, [answers, restored, phase]);

  const set = <K extends keyof MatchAnswers>(k: K, v: MatchAnswers[K]) => setAnswers((a) => ({ ...a, [k]: v }));
  const toggle = <K extends "topics" | "times">(k: K, v: MatchAnswers[K][number]) =>
    setAnswers((a) => {
      const list = a[k] as string[];
      return { ...a, [k]: list.includes(v) ? list.filter((x) => x !== v) : [...list, v] };
    });

  const finish = () => {
    saveQuiz(answers, true);
    void run(answers);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const restart = () => {
    clearQuiz();
    setAnswers(EMPTY_ANSWERS);
    setData(null);
    setStep(0);
    setPhase("quiz");
  };
  const forget = () => {
    clearQuiz();
    toast(tt("Ответы стёрты с\u00a0этого устройства"));
    setAnswers(EMPTY_ANSWERS);
    setData(null);
    setStep(0);
    setPhase("quiz");
  };

  const authedClient = authStatus === "authed" && role === "client";

  const startDialog = async (r: MatchResult) => {
    if (!authedClient) return setGate(r);
    setBusyId(r.psychologist.id);
    try {
      const d = await dialogsApi.startWithSpecialist(r.psychologist.id);
      router.push(`/app/dialogs?d=${encodeURIComponent(d.id)}`);
    } catch (e) {
      // e.g. «написать можно после записи» — then the booking is the way in
      toast(e instanceof ApiError ? e.message : tt("Не\u00a0получилось начать диалог"), { error: true });
      router.push(`/app/specialists/${r.psychologist.id}#booking`);
    } finally {
      setBusyId(null);
    }
  };
  const chooseTime = (r: MatchResult) => {
    if (!authedClient) return setGate(r);
    router.push(`/app/specialists/${r.psychologist.id}#booking`);
  };

  if (!restored) return <Skeleton height={420} radius={28} />;

  if (phase === "results") {
    const crisis = data?.crisis;
    const list = data?.results ?? [];
    return (
      <div className={s.wrap}>
        {crisis && crisis.level !== "none" && <CrisisCard level={crisis.level} help={crisis.help} />}

        <header className={s.resHead}>
          <div>
            <h2 className={s.resTitle}>{list.length ? tt("Кто вам может подойти") : tt("Подбор")}</h2>
            <p className={s.resSub}>
              {tt("Оценка складывается из\u00a0понятных частей: темы, стиль работы, бюджет, удобное время, опыт и\u00a0отзывы.")}
            </p>
          </div>
          <div className={s.resTools}>
            <Button variant="ghost" size="sm" icon={<ArrowLeft size={16} strokeWidth={1.8} />} onClick={() => { setPhase("quiz"); setStep(0); }}>
              {tt("Изменить ответы")}
            </Button>
            <Button variant="ghost" size="sm" icon={<RotateCcw size={16} strokeWidth={1.8} />} onClick={restart}>
              {tt("Заново")}
            </Button>
          </div>
        </header>

        {loading ? (
          <div className={s.results}>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} height={200} radius={22} />
            ))}
          </div>
        ) : error ? (
          <div className={s.error} role="alert">
            {error}{" "}
            <button type="button" className={s.link} onClick={() => run(answers)}>
              {tt("Попробовать снова")}
            </button>
          </div>
        ) : list.length === 0 ? (
          <div className={s.error}>{tt("Пока нет специалистов, которые принимают. Загляните чуть позже.")}</div>
        ) : (
          <>
            <ol className={s.results}>
              {list.slice(0, shown).map((r, i) => (
                <ResultCard
                  key={r.psychologist.id}
                  r={r}
                  rank={i + 1}
                  busy={busyId === r.psychologist.id}
                  linkable={authedClient}
                  onDialog={() => startDialog(r)}
                  onTime={() => chooseTime(r)}
                />
              ))}
            </ol>
            {shown < list.length && (
              <div className={s.more}>
                <Button variant="secondary" onClick={() => setShown((n) => n + PAGE)}>
                  {tt("Показать ещё")}
                </Button>
              </div>
            )}
          </>
        )}

        <PrivacyNote onForget={forget} />

        <Modal open={!!gate} onClose={() => setGate(null)} title={tt("Нужен анонимный аккаунт")} width={460}>
          <div className={s.gate}>
            <p>
              {tt("Чтобы написать")}{" "}{gate?.psychologist.display_name ? tt(`специалисту {display_name}`, { display_name: gate.psychologist.display_name }) : tt("специалисту")}{" "}{tt("или\u00a0записаться, создайте аккаунт. Это\u00a0минута: без\u00a0почты и\u00a0телефона, только пароль.")}
            </p>
            <p className={s.gateNote}>
              <ShieldCheck size={16} strokeWidth={1.8} aria-hidden />{" "}{tt("Ответы анкеты останутся на\u00a0этом устройстве, и\u00a0после входа подбор откроется снова.")}
            </p>
            <div className={s.gateActions}>
              <Button variant="secondary" href={`/login?next=${encodeURIComponent("/app/match")}`}>
                {tt("Войти")}
              </Button>
              <Button variant="primary" href={`/start?next=${encodeURIComponent("/app/match")}`}>
                {tt("Начать анонимно")}
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    );
  }

  // ── Quiz ──
  const canNext = step !== 0 || answers.topics.length > 0;
  return (
    <div className={s.wrap}>
      <div className={s.quiz}>
        <div className={s.progress} aria-hidden>
          {STEPS.map((name, i) => (
            <span key={name} className={s.progressStep} data-state={i < step ? "done" : i === step ? "now" : undefined} />
          ))}
        </div>
        <div className={s.stepMeta}>
          {tj("Вопрос {v} из {length}", { v: step + 1, length: STEPS.length })}
        </div>

        {step === 0 && (
          <fieldset className={s.step}>
            <legend className={s.q}>{tt("Что\u00a0привело вас сюда?")}</legend>
            <p className={s.qHint}>{tt("Можно выбрать несколько. Если сложно назвать\u00a0— отметьте то, что\u00a0ближе всего.")}</p>
            <div className={s.chips}>
              {TOPICS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  className={s.chip}
                  aria-pressed={answers.topics.includes(t.value)}
                  onClick={() => toggle("topics", t.value)}
                >
                  {answers.topics.includes(t.value) && <Check size={15} strokeWidth={2.4} aria-hidden />}
                  {t.label}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        {step === 1 && (
          <fieldset className={s.step}>
            <legend className={s.q}>{tt("Как\u00a0давно это\u00a0с\u00a0вами и\u00a0насколько тяжело?")}</legend>
            <div className={s.row}>
              <span className={s.rowLabel}>{tt("Как\u00a0давно")}</span>
              <Segmented<string>
                ariaLabel={tt("Как\u00a0давно")}
                value={answers.duration}
                onChange={(v) => set("duration", v as MatchAnswers["duration"])}
                options={DURATIONS}
              />
            </div>
            <div className={s.row}>
              <span className={s.rowLabel}>{tt("Насколько мешает")}</span>
              <Segmented<string>
                ariaLabel={tt("Насколько мешает")}
                value={answers.intensity}
                onChange={(v) => set("intensity", v as MatchAnswers["intensity"])}
                options={INTENSITY}
              />
            </div>
            <div className={s.safety}>
              <span className={s.rowLabel}>
                {tt("Бывают\u00a0ли у\u00a0вас мысли причинить себе вред или\u00a0что\u00a0не\u00a0хочется жить?")}
              </span>
              <p className={s.qHint}>{tt("Спрашиваем, чтобы вовремя подсказать, где помогут прямо сейчас. Ответ никуда не\u00a0сохраняется.")}</p>
              <Segmented<string>
                ariaLabel={tt("Мысли о\u00a0самоповреждении")}
                value={answers.safety}
                onChange={(v) => set("safety", v as MatchAnswers["safety"])}
                options={SAFETY}
              />
            </div>
            {answers.safety !== "no" && (
              <CrisisCard level={answers.safety === "now" ? "acute" : "some"} help={null} />
            )}
          </fieldset>
        )}

        {step === 2 && (
          <fieldset className={s.step}>
            <legend className={s.q}>{tt("Какой стиль работы вам ближе?")}</legend>
            <div className={s.styles}>
              {STYLES.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  className={s.style}
                  aria-pressed={answers.style === o.value}
                  onClick={() => set("style", answers.style === o.value ? "" : o.value)}
                >
                  <strong>{o.label}</strong>
                  <span>{o.hint}</span>
                </button>
              ))}
            </div>
            <button type="button" className={s.link} onClick={() => { set("style", ""); setStep(3); }}>
              {tt("Пока не\u00a0знаю\u00a0— подскажет специалист")}
            </button>
          </fieldset>
        )}

        {step === 3 && (
          <fieldset className={s.step}>
            <legend className={s.q}>{tt("Есть пожелания к\u00a0специалисту?")}</legend>
            <div className={s.row}>
              <span className={s.rowLabel}>{tt("Пол специалиста")}</span>
              <Segmented<string>
                ariaLabel={tt("Пол специалиста")}
                value={answers.gender || "any"}
                onChange={(v) => set("gender", v === "any" ? "" : (v as MatchAnswers["gender"]))}
                options={[
                  { value: "any", label: tt("Неважно") },
                  { value: "female", label: tt("Женщина") },
                  { value: "male", label: tt("Мужчина") },
                ]}
              />
            </div>
            <RangeField
              label={tt("Опыт")}
              min={0}
              max={20}
              step={1}
              value={answers.min_experience}
              onChange={(v) => set("min_experience", v)}
              format={(v) => (v === 0 ? tt("Неважно") : v >= 20 ? tt("От\u00a020\u00a0лет") : tt(`От\u00a0{v} {plural}`, { v, plural: plural(v, "года", "лет", "лет") }))}
              marks={[0, 3, 5, 10]}
              markLabel={(v) => (v === 0 ? tt("Неважно") : `${v}+`)}
            />
            <RangeField
              label={tt("Бюджет за\u00a0час")}
              min={1000}
              max={10000}
              step={500}
              value={answers.budget ?? 10000}
              onChange={(v) => set("budget", v >= 10000 ? null : v)}
              format={(v) => (v >= 10000 ? tt("Неважно") : tt(`До\u00a0{v} ₽`, { v: nf.format(v) }))}
              marks={[2000, 3000, 5000, 10000]}
              markLabel={(v) => (v >= 10000 ? tt("Неважно") : `${nf.format(v)}`)}
            />
          </fieldset>
        )}

        {step === 4 && (
          <fieldset className={s.step}>
            <legend className={s.q}>{tt("Когда вам удобно созваниваться?")}</legend>
            <p className={s.qHint}>{tt("По\u00a0вашему времени. Можно выбрать несколько или\u00a0пропустить.")}</p>
            <div className={s.times}>
              {TIMES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  className={s.timeOpt}
                  aria-pressed={answers.times.includes(t.value)}
                  onClick={() => toggle("times", t.value)}
                >
                  <strong>{t.label}</strong>
                  <span>{t.hint}</span>
                </button>
              ))}
            </div>
          </fieldset>
        )}

        <div className={s.nav}>
          {step > 0 ? (
            <Button variant="ghost" icon={<ArrowLeft size={16} strokeWidth={1.8} />} onClick={() => setStep(step - 1)}>
              {tt("Назад")}
            </Button>
          ) : (
            <span />
          )}
          {step < STEPS.length - 1 ? (
            <Button variant="primary" disabled={!canNext} onClick={() => setStep(step + 1)}>
              {step === 0 && !canNext ? tt("Выберите хотя\u00a0бы одно") : tt("Дальше")}
            </Button>
          ) : (
            <Button variant="primary" icon={<Sparkles size={16} strokeWidth={1.8} />} onClick={finish}>
              {tt("Показать, кто подходит")}
            </Button>
          )}
        </div>
      </div>
      <PrivacyNote onForget={forget} compact />
      {mode === "public" && (
        <p className={s.footNote}>
          {tt("Можно без\u00a0регистрации. Написать специалисту или\u00a0записаться\u00a0— после анонимного входа, ответы сохранятся.")}
        </p>
      )}
    </div>
  );
}

function ResultCard({
  r,
  rank,
  busy,
  linkable,
  onDialog,
  onTime,
}: {
  r: MatchResult;
  rank: number;
  busy: boolean;
  linkable: boolean;
  onDialog: () => void;
  onTime: () => void;
}) {
  const [open, setOpen] = useState(false);
  const p = r.psychologist;
  const scored = useMemo(() => r.reasons.filter((x) => x.max > 0), [r.reasons]);
  return (
    <li className={s.card} data-top={rank === 1 || undefined} data-miss={!r.fits || undefined}>
      <div className={s.cardMain}>
        <span className={s.photo}>
          <SpecialistPhoto url={p.photo_url} name={p.display_name} size={72} alt="" />
        </span>
        <div className={s.cardBody}>
          <div className={s.nameRow}>
            {linkable ? (
              <Link href={`/app/specialists/${p.id}`} className={s.name}>
                {p.display_name}
              </Link>
            ) : (
              <span className={s.name}>{p.display_name}</span>
            )}
            <RatingPill rating={p.rating} count={p.reviews_count} compact />
            <IntroChip psy={p} />
          </div>
          <p className={s.why}>{r.summary || tt("Подходит по\u00a0части ваших ответов\u00a0— подробности ниже.")}</p>
          <div className={s.facts}>
            <span>{tj("{rub} за\u00a0час", { rub: rub(r.price_hour_rub) })}</span>
            {p.next_slot && (
              <span>
                <CalendarClock size={14} strokeWidth={1.8} aria-hidden /> {dayLabel(p.next_slot)}{" "}{tt("в")}{" "}{time(p.next_slot)}
              </span>
            )}
          </div>
        </div>
        <ScoreRing value={r.score} />
      </div>

      <button type="button" className={s.explain} aria-expanded={open} onClick={() => setOpen((x) => !x)}>
        {tt("Как\u00a0посчитали")}{" "}<ChevronDown size={15} strokeWidth={2} aria-hidden />
      </button>
      {open && (
        <ul className={s.reasons}>
          {scored.map((x) => (
            <li key={x.key} data-ok={x.ok || undefined}>
              <span className={s.reasonText}>{x.text.charAt(0).toUpperCase() + x.text.slice(1)}</span>
              <span className={s.reasonPts}>
                {x.points}/{x.max}
              </span>
              <span className={s.bar} aria-hidden>
                <span style={{ width: `${Math.round((x.points / x.max) * 100)}%` }} />
              </span>
            </li>
          ))}
          {r.reasons
            .filter((x) => x.max === 0)
            .map((x) => (
              <li key={x.key} className={s.reasonMiss}>
                {x.text}
              </li>
            ))}
        </ul>
      )}

      <div className={s.actions}>
        <Button variant="primary" size="sm" icon={<MessageCircle size={16} strokeWidth={1.8} />} onClick={onDialog} loading={busy}>
          {tt("Начать диалог")}
        </Button>
        <Button variant="secondary" size="sm" icon={<CalendarClock size={16} strokeWidth={1.8} />} onClick={onTime}>
          {tt("Выбрать время")}
        </Button>
      </div>
    </li>
  );
}

function ScoreRing({ value }: { value: number }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  return (
    <div className={s.score} role="img" aria-label={tt(`Совпадение {value} из\u00a0100`, { value })}>
      <svg viewBox="0 0 56 56" width="56" height="56" aria-hidden>
        <circle cx="28" cy="28" r={r} className={s.ringBg} />
        <circle
          cx="28"
          cy="28"
          r={r}
          className={s.ringFg}
          strokeDasharray={`${(c * value) / 100} ${c}`}
          transform="rotate(-90 28 28)"
        />
      </svg>
      <span className={s.scoreNum}>{value}</span>
      <span className={s.scoreLbl}>{tt("из\u00a0100")}</span>
    </div>
  );
}

function CrisisCard({
  level,
  help,
}: {
  level: "some" | "acute";
  help: { label: string; phone: string; note: string }[] | null;
}) {
  const country = useCountry();
  // The server's list is Russian; elsewhere use the lines of the visitor's country (lib/i18n/countries.ts).
  const items =
    country.code === "RU" && help?.length
      ? help
      : [
          { label: tt("Экстренные службы"), phone: country.emergency, note: "" },
          ...country.lines.map((l) => ({ label: tt(l.label), phone: l.phone, note: "" })),
        ];
  return (
    <section className={s.crisis} data-level={level} role="alert" aria-label={tt("Помощь прямо сейчас")}>
      <p className={s.crisisText}>
        <LifeBuoy size={16} strokeWidth={1.9} aria-hidden />
        {level === "acute"
          ? tt("Если вы\u00a0в\u00a0опасности, позвоните сейчас\u00a0— там помогут сразу.")
          : tt("Если станет тяжелее, позвоните\u00a0— бесплатно и\u00a0анонимно.")}
      </p>
      <div className={s.crisisPhones}>
        {items.map((h) => (
          <a key={h.phone} href={`tel:${h.phone.replace(/[^\d+]/g, "")}`} className={s.phone} title={h.phone}>
            <Phone size={14} strokeWidth={1.9} aria-hidden />
            {h.label}
          </a>
        ))}
      </div>
    </section>
  );
}

function PrivacyNote({ onForget, compact }: { onForget: () => void; compact?: boolean }) {
  return (
    <p className={s.privacy} data-compact={compact || undefined}>
      <ShieldCheck size={16} strokeWidth={1.8} aria-hidden />
      <span>
        {tt("Ответы не\u00a0сохраняются на\u00a0сервере: мы\u00a0считаем подбор и\u00a0сразу их\u00a0забываем. Чтобы вы\u00a0могли вернуться, они хранятся только в\u00a0этом браузере.")}{" "}
        <button type="button" className={s.link} onClick={onForget}>
          <Trash2 size={13} strokeWidth={1.8} aria-hidden />{" "}{tt("Стереть ответы")}
        </button>
      </span>
    </p>
  );
}

/** Slider with quick marks — custom values instead of fixed dropdown options. */
function RangeField({
  label,
  min,
  max,
  step,
  value,
  onChange,
  format,
  marks,
  markLabel,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
  marks: number[];
  markLabel: (v: number) => string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className={s.range}>
      <div className={s.rangeHead}>
        <span className={s.rowLabel}>{label}</span>
        <strong aria-live="polite">{format(value)}</strong>
      </div>
      <input
        type="range"
        className={s.rangeInput}
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        aria-valuetext={format(value)}
        style={{ ["--p" as string]: `${pct}%` }}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <div className={s.rangeMarks} role="group" aria-label={tt(`{label}: быстрый выбор`, { label })}>
        {marks.map((m) => (
          <button key={m} type="button" className={s.chip} aria-pressed={value === m} onClick={() => onChange(m)}>
            {markLabel(m)}
          </button>
        ))}
      </div>
    </div>
  );
}
