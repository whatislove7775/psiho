/**
 * «Подбор специалиста» — short quiz → transparent weighted scoring (POST /api/v1/matching/).
 * Answers are never stored on the server; the browser keeps them locally so a person can come back
 * (and so a public visitor's answers survive «Начать анонимно»). See docs/API.md «Подбор по анкете».
 */
import { api } from "./client";
import type { PsychologistPublic } from "./types";

export type TopicKey =
  | "anxiety" | "burnout" | "relationships" | "self_esteem" | "grief" | "depression" | "panic"
  | "sleep" | "anger" | "addiction" | "crisis" | "family" | "loneliness";
export type DurationKey = "weeks" | "months" | "year";
export type IntensityKey = "mild" | "notable" | "heavy";
export type SafetyKey = "no" | "sometimes" | "now";
export type StyleKey = "support" | "techniques" | "depth";
export type TimeKey = "morning" | "day" | "evening" | "weekend";

export interface MatchAnswers {
  topics: TopicKey[];
  duration: DurationKey | "";
  intensity: IntensityKey | "";
  safety: SafetyKey;
  style: StyleKey | "";
  gender: "" | "female" | "male";
  min_experience: 0 | 3 | 5 | 10;
  budget: number | null;
  times: TimeKey[];
}

export const EMPTY_ANSWERS: MatchAnswers = {
  topics: [],
  duration: "",
  intensity: "",
  safety: "no",
  style: "",
  gender: "",
  min_experience: 0,
  budget: null,
  times: [],
};

export const TOPICS: { value: TopicKey; label: string }[] = [
  { value: "anxiety", label: "Тревога" },
  { value: "burnout", label: "Выгорание" },
  { value: "relationships", label: "Отношения" },
  { value: "self_esteem", label: "Самооценка" },
  { value: "grief", label: "Горе и утрата" },
  { value: "depression", label: "Апатия и депрессия" },
  { value: "panic", label: "Панические атаки" },
  { value: "sleep", label: "Сон" },
  { value: "anger", label: "Гнев и раздражение" },
  { value: "loneliness", label: "Одиночество" },
  { value: "family", label: "Семья и дети" },
  { value: "crisis", label: "Кризис, перемены" },
  { value: "addiction", label: "Зависимости" },
];

export const DURATIONS: { value: DurationKey; label: string }[] = [
  { value: "weeks", label: "Несколько недель" },
  { value: "months", label: "Несколько месяцев" },
  { value: "year", label: "Больше года" },
];
export const INTENSITY: { value: IntensityKey; label: string }[] = [
  { value: "mild", label: "Немного мешает" },
  { value: "notable", label: "Заметно мешает жить" },
  { value: "heavy", label: "Очень тяжело" },
];
export const SAFETY: { value: SafetyKey; label: string }[] = [
  { value: "no", label: "Нет" },
  { value: "sometimes", label: "Иногда бывают" },
  { value: "now", label: "Да, сейчас" },
];
export const STYLES: { value: StyleKey; label: string; hint: string }[] = [
  { value: "support", label: "Поддержка и разговор", hint: "Выговориться, почувствовать, что вас слышат и не оценивают" },
  { value: "techniques", label: "Конкретные техники и задания", hint: "Понятные упражнения между встречами: КПТ, ACT и похожие подходы" },
  { value: "depth", label: "Глубокая работа с причинами", hint: "Разобраться, откуда это берётся: прошлый опыт, повторяющиеся сценарии" },
];
export const TIMES: { value: TimeKey; label: string; hint: string }[] = [
  { value: "morning", label: "Утро", hint: "6–12" },
  { value: "day", label: "День", hint: "12–18" },
  { value: "evening", label: "Вечер", hint: "после 18" },
  { value: "weekend", label: "Выходные", hint: "сб и вс" },
];
export const BUDGETS = [2000, 3000, 4000, 5000];

export interface MatchReason {
  key: "topics" | "style" | "budget" | "time" | "experience" | "rating" | "gender";
  ok: boolean;
  text: string;
  points: number;
  max: number;
}

export interface MatchResult {
  psychologist: PsychologistPublic;
  /** 0–100 */
  score: number;
  /** false — does not meet a strict wish (gender); listed after everyone who does */
  fits: boolean;
  summary: string;
  price_hour_rub: number;
  reasons: MatchReason[];
}

export interface CrisisHelp {
  label: string;
  phone: string;
  note: string;
}

export interface MatchResponse {
  crisis: { level: "none" | "some" | "acute"; help: CrisisHelp[] };
  weights: Record<string, number>;
  stored: false;
  count: number;
  results: MatchResult[];
}

const clientTz = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
};

export const matchingApi = {
  match: (answers: MatchAnswers) =>
    api<MatchResponse>("/matching/", { method: "POST", body: { ...answers, tz: clientTz() } }),
};

// ── Local copy of the answers (this browser only) ───────────────────────────

const KEY = "aprosop.match.v1";

export interface SavedQuiz {
  answers: MatchAnswers;
  done: boolean;
  savedAt: number;
}

export function loadQuiz(): SavedQuiz | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as SavedQuiz;
    if (!v || typeof v !== "object" || !v.answers) return null;
    return { answers: { ...EMPTY_ANSWERS, ...v.answers }, done: !!v.done, savedAt: Number(v.savedAt) || 0 };
  } catch {
    return null;
  }
}

export function saveQuiz(answers: MatchAnswers, done: boolean) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ answers, done, savedAt: Date.now() }));
  } catch {
    /* private mode — the quiz still works, it just won't be remembered */
  }
}

export function clearQuiz() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
