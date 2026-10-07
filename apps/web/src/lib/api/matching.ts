/**
 * «Подбор специалиста» — short quiz → transparent weighted scoring (POST /api/v1/matching/).
 * Answers are never stored on the server; the browser keeps them locally so a person can come back
 * (and so a public visitor's answers survive «Начать анонимно»). See docs/API.md «Подбор по анкете».
 */
import { t } from "@/lib/i18n";
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
  /** years, 0 — doesn't matter (slider 0–20+) */
  min_experience: number;
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
  { value: "anxiety", get label() { return t("Тревога"); } },
  { value: "burnout", get label() { return t("Выгорание"); } },
  { value: "relationships", get label() { return t("Отношения"); } },
  { value: "self_esteem", get label() { return t("Самооценка"); } },
  { value: "grief", get label() { return t("Горе и\u00a0утрата"); } },
  { value: "depression", get label() { return t("Апатия и\u00a0депрессия"); } },
  { value: "panic", get label() { return t("Панические атаки"); } },
  { value: "sleep", get label() { return t("Сон"); } },
  { value: "anger", get label() { return t("Гнев и\u00a0раздражение"); } },
  { value: "loneliness", get label() { return t("Одиночество"); } },
  { value: "family", get label() { return t("Семья и\u00a0дети"); } },
  { value: "crisis", get label() { return t("Кризис, перемены"); } },
  { value: "addiction", get label() { return t("Зависимости"); } },
];

export const DURATIONS: { value: DurationKey; label: string }[] = [
  { value: "weeks", get label() { return t("Несколько недель"); } },
  { value: "months", get label() { return t("Несколько месяцев"); } },
  { value: "year", get label() { return t("Больше года"); } },
];
export const INTENSITY: { value: IntensityKey; label: string }[] = [
  { value: "mild", get label() { return t("Немного мешает"); } },
  { value: "notable", get label() { return t("Заметно мешает жить"); } },
  { value: "heavy", get label() { return t("Очень тяжело"); } },
];
export const SAFETY: { value: SafetyKey; label: string }[] = [
  { value: "no", get label() { return t("Нет"); } },
  { value: "sometimes", get label() { return t("Иногда бывают"); } },
  { value: "now", get label() { return t("Да, сейчас"); } },
];
export const STYLES: { value: StyleKey; label: string; hint: string }[] = [
  { value: "support", get label() { return t("Поддержка и\u00a0разговор"); }, get hint() { return t("Выговориться, почувствовать, что\u00a0вас слышат и\u00a0не\u00a0оценивают"); } },
  { value: "techniques", get label() { return t("Конкретные техники и\u00a0задания"); }, get hint() { return t("Понятные упражнения между встречами: КПТ, ACT и\u00a0похожие подходы"); } },
  { value: "depth", get label() { return t("Глубокая работа с\u00a0причинами"); }, get hint() { return t("Разобраться, откуда это\u00a0берётся: прошлый опыт, повторяющиеся сценарии"); } },
];
export const TIMES: { value: TimeKey; label: string; hint: string }[] = [
  { value: "morning", get label() { return t("Утро"); }, hint: "6–12" },
  { value: "day", get label() { return t("День"); }, hint: "12–18" },
  { value: "evening", get label() { return t("Вечер"); }, get hint() { return t("после 18"); } },
  { value: "weekend", get label() { return t("Выходные"); }, get hint() { return t("сб\u00a0и\u00a0вс"); } },
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
    const savedAt = Number(v.savedAt) || 0;
    if (!savedAt || Date.now() - savedAt > 24 * 60 * 60 * 1000 || savedAt > Date.now()) {
      clearQuiz();
      return null;
    }
    const { safety: _safety, ...safeAnswers } = v.answers;
    const answers = { ...EMPTY_ANSWERS, ...safeAnswers, safety: "no" as const };
    saveQuiz(answers, !!v.done, savedAt);
    return { answers, done: !!v.done, savedAt };
  } catch {
    return null;
  }
}

export function saveQuiz(answers: MatchAnswers, done: boolean, savedAt = Date.now()) {
  try {
    const { safety: _safety, ...safeAnswers } = answers;
    window.localStorage.setItem(KEY, JSON.stringify({ answers: safeAnswers, done, savedAt }));
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
