"use client";

/**
 * «Подбор специалиста»: 5 short questions → top specialists with a score and a human «why».
 * Used in the cabinet (/app/match) and publicly (/match, no login). Answers stay in this browser only.
 */
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
import { Button, Modal, Segmented, Select, Skeleton, useToast } from "@/ui";
import { SpecialistPhoto } from "@/components/avatar/SpecialistPhoto";
import { RatingPill } from "@/components/reviews/ReviewBits";
import { ApiError } from "@/lib/api/client";
import { dialogsApi } from "@/lib/api/dialogs";
import {
  BUDGETS,
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
import { dayLabel, rub, time } from "@/lib/format";
import { IntroChip } from "./IntroChip";
import s from "./matching.module.css";

const STEPS = ["Что беспокоит", "Как давно", "Стиль работы", "Пожелания", "Время"] as const;
const PAGE = 3;
const nf = new Intl.NumberFormat("ru-RU");

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
      setError(e instanceof ApiError ? e.message : "Не получилось подобрать специалистов. Попробуйте ещё раз.");
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
    toast("Ответы стёрты с этого устройства");
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
      toast(e instanceof ApiError ? e.message : "Не получилось начать диалог", { error: true });
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
            <h2 className={s.resTitle}>{list.length ? "Кто вам может подойти" : "Подбор"}</h2>
            <p className={s.resSub}>
              Оценка складывается из понятных частей: темы, стиль работы, бюджет, удобное время, опыт и отзывы.
            </p>
          </div>
          <div className={s.resTools}>
            <Button variant="ghost" size="sm" icon={<ArrowLeft size={16} strokeWidth={1.8} />} onClick={() => { setPhase("quiz"); setStep(0); }}>
              Изменить ответы
            </Button>
            <Button variant="ghost" size="sm" icon={<RotateCcw size={16} strokeWidth={1.8} />} onClick={restart}>
              Заново
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
              Попробовать снова
            </button>
          </div>
        ) : list.length === 0 ? (
          <div className={s.error}>Пока нет специалистов, которые принимают. Загляните чуть позже.</div>
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
                  Показать ещё
                </Button>
              </div>
            )}
          </>
        )}

        <PrivacyNote onForget={forget} />

        <Modal open={!!gate} onClose={() => setGate(null)} title="Нужен анонимный аккаунт" width={460}>
          <div className={s.gate}>
            <p>
              Чтобы написать {gate?.psychologist.display_name ? `специалисту ${gate.psychologist.display_name}` : "специалисту"} или
              записаться, создайте аккаунт. Это минута: без почты и телефона, только пароль.
            </p>
            <p className={s.gateNote}>
              <ShieldCheck size={16} strokeWidth={1.8} aria-hidden /> Ответы анкеты останутся на этом устройстве, и после входа
              подбор откроется снова.
            </p>
            <div className={s.gateActions}>
              <Button variant="secondary" href={`/login?next=${encodeURIComponent("/app/match")}`}>
                Войти
              </Button>
              <Button variant="primary" href={`/start?next=${encodeURIComponent("/app/match")}`}>
                Начать анонимно
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
          Вопрос {step + 1} из {STEPS.length}
        </div>

        {step === 0 && (
          <fieldset className={s.step}>
            <legend className={s.q}>Что привело вас сюда?</legend>
            <p className={s.qHint}>Можно выбрать несколько. Если сложно назвать — отметьте то, что ближе всего.</p>
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
            <legend className={s.q}>Как давно это с вами и насколько тяжело?</legend>
            <div className={s.row}>
              <span className={s.rowLabel}>Как давно</span>
              <Segmented<string>
                ariaLabel="Как давно"
                value={answers.duration}
                onChange={(v) => set("duration", v as MatchAnswers["duration"])}
                options={DURATIONS}
              />
            </div>
            <div className={s.row}>
              <span className={s.rowLabel}>Насколько мешает</span>
              <Segmented<string>
                ariaLabel="Насколько мешает"
                value={answers.intensity}
                onChange={(v) => set("intensity", v as MatchAnswers["intensity"])}
                options={INTENSITY}
              />
            </div>
            <div className={s.safety}>
              <span className={s.rowLabel}>
                Бывают ли у вас мысли причинить себе вред или что не хочется жить?
              </span>
              <p className={s.qHint}>Спрашиваем, чтобы вовремя подсказать, где помогут прямо сейчас. Ответ никуда не сохраняется.</p>
              <Segmented<string>
                ariaLabel="Мысли о самоповреждении"
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
            <legend className={s.q}>Какой стиль работы вам ближе?</legend>
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
              Пока не знаю — подскажет специалист
            </button>
          </fieldset>
        )}

        {step === 3 && (
          <fieldset className={s.step}>
            <legend className={s.q}>Есть пожелания к специалисту?</legend>
            <div className={s.row}>
              <span className={s.rowLabel}>Пол специалиста</span>
              <Segmented<string>
                ariaLabel="Пол специалиста"
                value={answers.gender || "any"}
                onChange={(v) => set("gender", v === "any" ? "" : (v as MatchAnswers["gender"]))}
                options={[
                  { value: "any", label: "Неважно" },
                  { value: "female", label: "Женщина" },
                  { value: "male", label: "Мужчина" },
                ]}
              />
            </div>
            <div className={s.grid2}>
              <Select<number>
                label="Опыт"
                value={answers.min_experience}
                onChange={(v) => set("min_experience", v as MatchAnswers["min_experience"])}
                options={[
                  { value: 0, label: "Неважно" },
                  { value: 3, label: "От 3 лет" },
                  { value: 5, label: "От 5 лет" },
                  { value: 10, label: "От 10 лет" },
                ]}
              />
              <Select<number>
                label="Бюджет за час"
                value={answers.budget ?? 0}
                onChange={(v) => set("budget", v || null)}
                options={[
                  { value: 0, label: "Неважно" },
                  ...BUDGETS.map((b) => ({ value: b, label: `До ${nf.format(b)} ₽` })),
                ]}
              />
            </div>
          </fieldset>
        )}

        {step === 4 && (
          <fieldset className={s.step}>
            <legend className={s.q}>Когда вам удобно созваниваться?</legend>
            <p className={s.qHint}>По вашему времени. Можно выбрать несколько или пропустить.</p>
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
              Назад
            </Button>
          ) : (
            <span />
          )}
          {step < STEPS.length - 1 ? (
            <Button variant="primary" disabled={!canNext} onClick={() => setStep(step + 1)}>
              {step === 0 && !canNext ? "Выберите хотя бы одно" : "Дальше"}
            </Button>
          ) : (
            <Button variant="primary" icon={<Sparkles size={16} strokeWidth={1.8} />} onClick={finish}>
              Показать, кто подходит
            </Button>
          )}
        </div>
      </div>
      <PrivacyNote onForget={forget} compact />
      {mode === "public" && (
        <p className={s.footNote}>
          Можно без регистрации. Написать специалисту или записаться — после анонимного входа, ответы сохранятся.
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
          <p className={s.why}>{r.summary || "Подходит по части ваших ответов — подробности ниже."}</p>
          <div className={s.facts}>
            <span>{rub(r.price_hour_rub)} за час</span>
            {p.next_slot && (
              <span>
                <CalendarClock size={14} strokeWidth={1.8} aria-hidden /> {dayLabel(p.next_slot)} в {time(p.next_slot)}
              </span>
            )}
          </div>
        </div>
        <ScoreRing value={r.score} />
      </div>

      <button type="button" className={s.explain} aria-expanded={open} onClick={() => setOpen((x) => !x)}>
        Как посчитали <ChevronDown size={15} strokeWidth={2} aria-hidden />
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
          Начать диалог
        </Button>
        <Button variant="secondary" size="sm" icon={<CalendarClock size={16} strokeWidth={1.8} />} onClick={onTime}>
          Выбрать время
        </Button>
      </div>
    </li>
  );
}

function ScoreRing({ value }: { value: number }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  return (
    <div className={s.score} role="img" aria-label={`Совпадение ${value} из 100`}>
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
      <span className={s.scoreLbl}>из 100</span>
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
  const items = help?.length
    ? help
    : [
        { label: "Экстренные службы", phone: "112", note: "" },
        { label: "Телефон доверия", phone: "8-800-333-44-34", note: "" },
      ];
  return (
    <section className={s.crisis} data-level={level} role="alert" aria-label="Помощь прямо сейчас">
      <p className={s.crisisText}>
        <LifeBuoy size={16} strokeWidth={1.9} aria-hidden />
        {level === "acute"
          ? "Если вы в опасности, позвоните сейчас — там помогут сразу."
          : "Если станет тяжелее, позвоните — бесплатно и анонимно."}
      </p>
      <div className={s.crisisPhones}>
        {items.map((h) => (
          <a key={h.phone} href={`tel:${h.phone.replace(/-/g, "")}`} className={s.phone} title={h.phone}>
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
        Ответы не сохраняются на сервере: мы считаем подбор и сразу их забываем. Чтобы вы могли вернуться, они хранятся
        только в этом браузере.{" "}
        <button type="button" className={s.link} onClick={onForget}>
          <Trash2 size={13} strokeWidth={1.8} aria-hidden /> Стереть ответы
        </button>
      </span>
    </p>
  );
}
