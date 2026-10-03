/** L1: статьи специалистов, модерация, обложки, живое селфи для проверки. */
import { t, msg } from "@/lib/i18n";
import { api, API_BASE } from "./client";
import type { ArticleDraft, Source } from "./content";

export interface CoverImage {
  id: string;
  /** 1600×900 */
  url: string;
  /** 800×450 */
  md: string;
  /** 480×270 */
  sm: string;
  width: number;
  height: number;
}

/** 16:9 crop as fractions of the source: x/y — top-left, w — frame width. */
export interface CoverCrop {
  x: number;
  y: number;
  w: number;
}

export type ArticleStatus = "draft" | "pending" | "approved" | "rejected";

export const STATUS_LABEL: Record<ArticleStatus, string> = {
  get draft() { return t("Черновик"); },
  get pending() { return t("На\u00a0модерации"); },
  get approved() { return t("Опубликована"); },
  get rejected() { return t("Отклонена"); },
};

export interface MyArticle {
  id: number;
  slug: string;
  title: string;
  summary: string;
  /** Sanitized HTML from the visual editor. */
  content: string;
  topic: string;
  topic_label: string;
  topics: string[];
  topic_labels: string[];
  sources: Source[];
  cover: string;
  cover_image: CoverImage | null;
  reading_minutes: number;
  status: ArticleStatus;
  moderation_comment: string;
  submitted_at: string | null;
  moderated_at: string | null;
  published_at: string | null;
  is_published: boolean;
  /** «Выбор редакции» — badge + ranking boost (docs/API.md). */
  editors_choice: boolean;
  reads: number;
  created_at: string;
  updated_at: string;
  /** S2: language the article is written in (lib/i18n/languages.ts) */
  language?: string;
}

export type MyArticleInput = Partial<Pick<MyArticle, "title" | "summary" | "content" | "topics" | "sources" | "language">> & {
  cover_image_id?: string | null;
};

export const myArticlesApi = {
  list: () => api<MyArticle[]>("/content/my/articles/"),
  get: (id: number) => api<MyArticle>(`/content/my/articles/${id}/`),
  create: (body: MyArticleInput) => api<MyArticle>("/content/my/articles/", { method: "POST", body }),
  update: (id: number, body: MyArticleInput) => api<MyArticle>(`/content/my/articles/${id}/`, { method: "PATCH", body }),
  remove: (id: number) => api<void>(`/content/my/articles/${id}/`, { method: "DELETE" }),
  submit: (id: number) => api<MyArticle>(`/content/my/articles/${id}/submit/`, { method: "POST" }),
  withdraw: (id: number) => api<MyArticle>(`/content/my/articles/${id}/withdraw/`, { method: "POST" }),
};

export const coverApi = {
  upload: (file: Blob, crop?: CoverCrop) => {
    const fd = new FormData();
    fd.append("image", file, "cover");
    if (crop) fd.append("crop", JSON.stringify(crop));
    return api<CoverImage>("/content/covers/", { method: "POST", body: fd });
  },
};

/** Staff moderation of specialist articles (content.publish). */
export const moderationApi = {
  queue: () => api<ArticleDraft[]>("/content/manage/articles/", { query: { source: "specialists" } }),
  moderate: (id: number, decision: "approve" | "reject", comment = "") =>
    api<ArticleDraft>(`/content/manage/articles/${id}/moderate/`, { method: "POST", body: { decision, comment } }),
  editorsChoice: (id: number, on: boolean) =>
    api<ArticleDraft>(`/content/manage/articles/${id}/editors-choice/`, { method: "POST", body: { editors_choice: on } }),
};

/** +1 read, fire-and-forget (no cookies, no identity). */
export function countRead(slug: string) {
  try {
    const url = `${API_BASE}/content/articles/${encodeURIComponent(slug)}/read/`;
    if (typeof navigator !== "undefined" && navigator.sendBeacon) navigator.sendBeacon(url);
    else void fetch(url, { method: "POST", keepalive: true });
  } catch {
    /* ignore */
  }
}

// ── Live verification selfie ───────────────────────────────────────────────

export interface SelfieState {
  taken_at: string | null;
  delete_after: string | null;
  retention_days: number;
  required: boolean;
  challenge?: { code: string; text: string };
}

export const selfieApi = {
  state: () => api<SelfieState>("/psychologist/selfie/"),
  upload: (frame1: Blob, frame2: Blob, challenge: string) => {
    const fd = new FormData();
    fd.append("frame1", frame1, "frame1.jpg");
    fd.append("frame2", frame2, "frame2.jpg");
    fd.append("challenge", challenge);
    return api<SelfieState>("/psychologist/selfie/", { method: "POST", body: fd });
  },
};

export interface StaffSelfieMeta extends SelfieState {
  exists: boolean;
  challenge_text: string;
}

export const staffSelfieApi = {
  meta: (profileId: number) => api<StaffSelfieMeta>(`/staff/specialists/${profileId}/selfie/`),
  /** Each call is written to the audit log. */
  frames: (profileId: number) =>
    api<{ frames: string[]; challenge_text: string; taken_at: string }>(`/staff/specialists/${profileId}/selfie/frames/`),
};

export const COVER_HINT = msg("Рекомендуем 1600×900, JPG, PNG или\u00a0WebP, до\u00a05\u00a0МБ");
export const PHOTO_HINT = msg("Квадрат от\u00a0800×800, JPG, PNG или\u00a0WebP, до\u00a05\u00a0МБ");
