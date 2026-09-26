/** Reviews of specialists (only after a completed call). See docs/API.md «Отзывы». */
import { api } from "./client";

export interface ReviewTag {
  key: string;
  label: string;
}

export const REVIEW_TAGS: ReviewTag[] = [
  { key: "attentive", label: "Внимательный" },
  { key: "clarity", label: "Помог разобраться" },
  { key: "gentle", label: "Бережный" },
  { key: "tools", label: "Даёт инструменты" },
  { key: "progress", label: "Есть результат" },
  { key: "punctual", label: "Пунктуальный" },
  { key: "clear", label: "Понятно объясняет" },
  { key: "safe", label: "С ним спокойно" },
];

export interface Review {
  id: number;
  rating: number;
  text: string;
  tags: ReviewTag[];
  /** «Клиент, 3 созвона» — the author is never shown */
  author_label: string;
  calls_count: number;
  /** "2026-09" — month precision on purpose */
  month: string;
  edited: boolean;
  reply: { text: string; month: string | null } | null;
  mine: boolean;
}

export interface MyReview extends Review {
  status: "published" | "hidden";
  hidden_reason: string;
  created_at: string;
  updated_at: string;
}

export interface ReviewSummary {
  rating: number | null;
  count: number;
  distribution: Record<"1" | "2" | "3" | "4" | "5", number>;
  top_tags: (ReviewTag & { count: number })[];
}

export interface StaffReview extends Review {
  status: "published" | "hidden";
  hidden_reason: string;
  created_at: string;
  author: { id: string; alias: string };
  specialist: { id: number; display_name: string };
  reports: { id: number; reason: string; reason_label: string; comment: string; status: string; created_at: string }[];
}

export interface ReviewInput {
  rating: number;
  text?: string;
  tags?: string[];
}

export const reviewsApi = {
  list: (psychologistId: number, page = 1) =>
    api<{ summary: ReviewSummary; count: number; page: number; pages: number; results: Review[] }>(
      `/psychologists/${psychologistId}/reviews/`,
      { query: { page } },
    ),
  eligibility: (psychologistId: number) =>
    api<{ can_review: boolean; completed_calls: number; review: MyReview | null; tags: ReviewTag[] }>("/reviews/eligibility/", {
      query: { psychologist: psychologistId },
    }),
  save: (psychologistId: number, body: ReviewInput) =>
    api<MyReview>("/reviews/", { method: "POST", body: { psychologist: psychologistId, ...body } }),
  remove: (id: number) => api<void>(`/reviews/${id}/`, { method: "DELETE" }),
  aboutMe: () => api<{ summary: ReviewSummary; results: (Review & { can_reply: boolean })[] }>("/reviews/about-me/"),
  reply: (id: number, text: string) => api<Review>(`/reviews/${id}/reply/`, { method: "POST", body: { text } }),
  report: (id: number, reason: string, comment = "") =>
    api<{ id: number }>("/reports/", { method: "POST", body: { target_type: "review", target_id: String(id), reason, comment } }),

  staffList: (q: { status?: "reported" | "hidden" | "all"; page?: number }) =>
    api<{ count: number; page: number; pages: number; results: StaffReview[]; counts: Record<"reported" | "hidden" | "all", number> }>(
      "/staff/reviews/",
      { query: q },
    ),
  moderate: (id: number, action: "hide" | "restore" | "keep", note = "") =>
    api<StaffReview>(`/staff/reviews/${id}/moderate/`, { method: "POST", body: { action, note } }),
};

const MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];

export function monthLabel(ym: string | null | undefined): string {
  if (!ym) return "";
  const [y, m] = ym.split("-").map(Number);
  const name = MONTHS[(m || 1) - 1] ?? "";
  return `${name[0]?.toUpperCase() ?? ""}${name.slice(1)} ${y}`;
}

export function ratingText(r: number | null | undefined): string {
  return r == null ? "" : r.toFixed(1).replace(".", ",");
}
