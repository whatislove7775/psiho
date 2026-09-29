/** Articles & practices (apps/api/apps/content). Public reads + staff CMS writes. */
import { api } from "./client";

export type Cover = "peach" | "butter" | "lime" | "mint" | "lilac" | "sky";
export const COVERS: Cover[] = ["peach", "butter", "lime", "mint", "lilac", "sky"];

/** Article topics (apps/content/models.py Topic). An article has 1–3; the first is the primary one. */
export const TOPICS: { value: string; label: string }[] = [
  { value: "anxiety", label: "Тревога" },
  { value: "mood", label: "Депрессия и\u00a0настроение" },
  { value: "stress", label: "Стресс и\u00a0выгорание" },
  { value: "sleep", label: "Сон" },
  { value: "emotions", label: "Эмоции" },
  { value: "self", label: "Самооценка" },
  { value: "relationships", label: "Отношения" },
  { value: "family", label: "Семья и\u00a0дети" },
  { value: "conflicts", label: "Конфликты" },
  { value: "boundaries", label: "Границы" },
  { value: "loneliness", label: "Одиночество" },
  { value: "loss", label: "Горе и\u00a0утрата" },
  { value: "trauma", label: "Травма" },
  { value: "addiction", label: "Зависимости" },
  { value: "eating", label: "Пищевое поведение" },
  { value: "work", label: "Работа и\u00a0карьера" },
  { value: "body", label: "Телесность" },
  { value: "mindfulness", label: "Осознанность" },
  { value: "teens", label: "Подростки" },
  { value: "therapy", label: "О\u00a0терапии" },
];
export const MAX_TOPICS = 3;
export const topicLabel = (v: string) => TOPICS.find((t) => t.value === v)?.label ?? v;

export const PRACTICE_KINDS: { value: PracticeKind; label: string }[] = [
  { value: "breathing", label: "Дыхание" },
  { value: "grounding", label: "Заземление" },
  { value: "body", label: "Тело" },
  { value: "journaling", label: "Записи" },
  { value: "mindfulness", label: "Осознанность" },
];

export type EvidenceLevel = "strong" | "moderate" | "limited" | "practice" | "";

export const EVIDENCE_LEVELS: { value: Exclude<EvidenceLevel, "">; label: string; short: string; hint: string }[] = [
  {
    value: "strong",
    label: "Сильная доказательная база",
    short: "Сильные доказательства",
    hint: "Клинические руководства, метаанализы и\u00a0обзоры многих исследований.",
  },
  {
    value: "moderate",
    label: "Умеренная доказательная база",
    short: "Умеренные доказательства",
    hint: "Есть обзоры и\u00a0хорошие исследования, но\u00a0данных меньше или\u00a0они неоднородны.",
  },
  {
    value: "limited",
    label: "Ограниченные данные",
    short: "Данных пока мало",
    hint: "Отдельные исследования или\u00a0небольшие эффекты. Относитесь как\u00a0к\u00a0мягкой поддержке.",
  },
  {
    value: "practice",
    label: "Практический опыт",
    short: "Опыт практики",
    hint: "Распространённые рекомендации специалистов; отдельных исследований мало.",
  },
];

/** A verified source. `[n]` markers in texts point to the 1-based position in the list. */
export interface Source {
  title: string;
  url: string;
  authors?: string;
  year?: number;
  publisher?: string;
  doi?: string;
  kind?: "guideline" | "review" | "study" | "org" | "book" | "other";
}

export interface KeyFact {
  text: string;
  refs: number[];
}

export interface ArticleCard {
  id: number;
  slug: string;
  title: string;
  summary: string;
  /** Primary topic (= topics[0]): cover illustration and colour. */
  topic: string;
  topic_label: string;
  /** 1–3 topics, primary first. */
  topics?: string[];
  topic_labels?: string[];
  /** Average of 1–5 stars from signed-in readers; avg is null while count is 0. */
  rating?: { avg: number | null; count: number };
  tags: string[];
  cover: Cover;
  emoji: string;
  reading_minutes: number;
  author_name: string;
  published_at: string | null;
  updated_at?: string;
  evidence_level?: EvidenceLevel;
  /** Own cover picture (16:9 WebP); null → topic illustration on the `cover` tone. */
  cover_image?: { id: string; url: string; md: string; sm: string; width: number; height: number } | null;
  /** Set when a specialist wrote the article («От специалиста»). Detail adds bio etc. */
  specialist?: {
    id: number;
    name: string;
    photo_url: string | null;
    bio?: string;
    specializations?: string[];
    experience_years?: number;
  } | null;
  /** «Выбор редакции» badge (feed order itself comes from the ranking score). */
  editors_choice?: boolean;
}

export interface Article extends ArticleCard {
  /** Sanitized HTML from the visual editor (render with components/content/RichText). */
  content: string;
  key_facts?: KeyFact[];
  when_to_seek_help?: string;
  sources?: Source[];
  reviewed_at?: string | null;
}

export interface ArticleDraft extends Article {
  is_published: boolean;
  created_at: string;
  updated_at: string;
  /** legacy Markdown, write-only (old clients); the text is `content` */
  body?: string;
  /** write-only on save: uploaded cover id, or null to remove */
  cover_image_id?: string | null;
  moderation?: "" | "draft" | "pending" | "approved" | "rejected";
  moderation_comment?: string;
  submitted_at?: string | null;
  moderated_at?: string | null;
  reads?: number;
}

export type PracticeKind = "breathing" | "grounding" | "body" | "journaling" | "mindfulness";

export interface PracticeStep {
  title: string;
  text: string;
  seconds?: number;
}

export interface BreathPattern {
  inhale: number;
  hold: number;
  exhale: number;
  hold_after: number;
  cycles: number;
}

export interface PracticeCard {
  id: number;
  slug: string;
  title: string;
  summary: string;
  kind: PracticeKind;
  kind_label: string;
  duration_minutes: number;
  cover: Cover;
  emoji: string;
  evidence_level?: EvidenceLevel;
  updated_at?: string;
}

export interface Practice extends PracticeCard {
  steps: PracticeStep[];
  pattern: BreathPattern | null;
  mechanism?: string;
  cautions?: string;
  sources?: Source[];
  reviewed_at?: string | null;
}

export interface PracticeDraft extends Practice {
  order: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface TopicCount {
  value: string;
  label: string;
  count: number;
}

export const contentApi = {
  topics: () => api<TopicCount[]>("/content/topics/", { auth: false }),
  /** topic: one value or several comma-separated (any of them matches) */
  articles: (q: { topic?: string; limit?: number; exclude?: string; q?: string; source?: "specialists" | "editorial"; sort?: "top" } = {}) =>
    api<ArticleCard[]>("/content/articles/", { query: { ...q }, auth: false }),
  article: (slug: string) => api<Article>(`/content/articles/${encodeURIComponent(slug)}/`, { auth: false }),
  practices: (q: { kind?: string; limit?: number } = {}) =>
    api<PracticeCard[]>("/content/practices/", { query: { ...q }, auth: false }),
  practice: (slug: string) => api<Practice>(`/content/practices/${encodeURIComponent(slug)}/`, { auth: false }),
};

export const contentAdminApi = {
  articles: () => api<ArticleDraft[]>("/content/manage/articles/"),
  article: (id: number) => api<ArticleDraft>(`/content/manage/articles/${id}/`),
  createArticle: (body: Partial<ArticleDraft>) =>
    api<ArticleDraft>("/content/manage/articles/", { method: "POST", body }),
  updateArticle: (id: number, body: Partial<ArticleDraft>) =>
    api<ArticleDraft>(`/content/manage/articles/${id}/`, { method: "PATCH", body }),
  deleteArticle: (id: number) => api<void>(`/content/manage/articles/${id}/`, { method: "DELETE" }),
  practices: () => api<PracticeDraft[]>("/content/manage/practices/"),
  practice: (id: number) => api<PracticeDraft>(`/content/manage/practices/${id}/`),
  createPractice: (body: Partial<PracticeDraft>) =>
    api<PracticeDraft>("/content/manage/practices/", { method: "POST", body }),
  updatePractice: (id: number, body: Partial<PracticeDraft>) =>
    api<PracticeDraft>(`/content/manage/practices/${id}/`, { method: "PATCH", body }),
  deletePractice: (id: number) => api<void>(`/content/manage/practices/${id}/`, { method: "DELETE" }),
};

/** Latin slug from a Russian title (for new CMS items). */
export function slugify(title: string): string {
  const map: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l",
    м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh",
    щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  };
  return title
    .toLowerCase()
    .split("")
    .map((c) => map[c] ?? c)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
