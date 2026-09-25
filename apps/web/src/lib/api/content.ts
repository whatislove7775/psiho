/** Articles & practices (apps/api/apps/content). Public reads + staff CMS writes. */
import { api } from "./client";

export type Cover = "peach" | "butter" | "lime" | "mint" | "lilac" | "sky";
export const COVERS: Cover[] = ["peach", "butter", "lime", "mint", "lilac", "sky"];

export const TOPICS: { value: string; label: string }[] = [
  { value: "anxiety", label: "Тревога" },
  { value: "mood", label: "Настроение" },
  { value: "stress", label: "Стресс и выгорание" },
  { value: "sleep", label: "Сон" },
  { value: "relationships", label: "Отношения" },
  { value: "self", label: "Самооценка" },
  { value: "loss", label: "Горе и утрата" },
  { value: "therapy", label: "О терапии" },
];

export const PRACTICE_KINDS: { value: PracticeKind; label: string }[] = [
  { value: "breathing", label: "Дыхание" },
  { value: "grounding", label: "Заземление" },
  { value: "body", label: "Тело" },
  { value: "journaling", label: "Записи" },
  { value: "mindfulness", label: "Осознанность" },
];

export interface ArticleCard {
  id: number;
  slug: string;
  title: string;
  summary: string;
  topic: string;
  topic_label: string;
  tags: string[];
  cover: Cover;
  emoji: string;
  reading_minutes: number;
  author_name: string;
  published_at: string | null;
}

export interface Article extends ArticleCard {
  body: string;
}

export interface ArticleDraft extends Article {
  is_published: boolean;
  created_at: string;
  updated_at: string;
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
}

export interface Practice extends PracticeCard {
  steps: PracticeStep[];
  pattern: BreathPattern | null;
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
  articles: (q: { topic?: string; limit?: number; exclude?: string } = {}) =>
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
