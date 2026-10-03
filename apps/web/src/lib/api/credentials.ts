/** Specialist credentials (diplomas, supervision, publications…). See docs/API.md «Документы специалистов». */
import { t } from "@/lib/i18n";
import { API_BASE, api, tokens } from "./client";

export type CredentialKind =
  | "diploma"
  | "retraining"
  | "method"
  | "supervision"
  | "membership"
  | "publication"
  | "course"
  | "other";

export type CredentialStatus = "pending" | "approved" | "rejected" | "needs_info";

export const KIND_LABEL: Record<CredentialKind, string> = {
  get diploma() { return t("Диплом о\u00a0высшем образовании"); },
  get retraining() { return t("Переподготовка, ДПО"); },
  get method() { return t("Сертификат метода"); },
  get supervision() { return t("Супервизия"); },
  get membership() { return t("Членство в\u00a0ассоциации"); },
  get publication() { return t("Публикация"); },
  get course() { return t("Курс или\u00a0тренинг"); },
  get other() { return t("Другое"); },
};

export const KIND_ORDER: CredentialKind[] = [
  "diploma",
  "retraining",
  "method",
  "supervision",
  "membership",
  "publication",
  "course",
  "other",
];

export const STATUS_LABEL: Record<CredentialStatus, string> = {
  get pending() { return t("На\u00a0проверке"); },
  get approved() { return t("Подтверждено"); },
  get rejected() { return t("Отклонено"); },
  get needs_info() { return t("Нужно уточнить"); },
};

export const STATUS_TONE: Record<CredentialStatus, "warning" | "success" | "danger" | "primary"> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
  needs_info: "primary",
};

export interface CredentialFileInfo {
  id: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  kind: "pdf" | "image";
  /** absolute path (/api/v1/…); private ones need the Authorization header */
  url: string;
  name?: string;
  is_public?: boolean;
  created_at?: string;
}

export interface CredentialNote {
  id: number;
  author_role: "staff" | "specialist" | "system";
  author: string;
  text: string;
  created_at: string;
}

interface CredentialBase {
  id: string;
  kind: CredentialKind;
  kind_label: string;
  title: string;
  issuer: string;
  year: number | null;
  year_end: number | null;
  supervisor: string;
  hours: number | null;
  url: string;
  doi: string;
  files: CredentialFileInfo[];
}

export interface Credential extends CredentialBase {
  number: string;
  /** «Показывать номер клиентам полностью» */
  number_public: boolean;
  status: CredentialStatus;
  status_label: string;
  reject_reason: string;
  was_approved: boolean;
  reviewed_at: string | null;
  submitted_at: string;
  notes: CredentialNote[];
}

export interface StaffCredential extends Credential {
  reviewed_by: string | null;
  specialist: {
    id: number;
    display_name: string;
    photo_url: string | null;
    verification_status: string;
    experience_years: number;
  };
}

export interface PublicCredential extends CredentialBase {
  number_masked: string;
  /** full number — only when the specialist chose to show it */
  number?: string;
  verified_at: string | null;
}

export interface CredentialInput {
  kind: CredentialKind;
  title: string;
  issuer?: string;
  year?: number | null;
  year_end?: number | null;
  supervisor?: string;
  hours?: number | null;
  url?: string;
  doi?: string;
  number?: string;
  number_public?: boolean;
}

export const CREDENTIAL_MAX_BYTES = 10 * 1024 * 1024;
export const CREDENTIAL_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

export const credentialsApi = {
  mine: () => api<Credential[]>("/psychologist/credentials/"),
  create: (body: CredentialInput) => api<Credential>("/psychologist/credentials/", { method: "POST", body }),
  update: (id: string, body: Partial<CredentialInput>) =>
    api<Credential>(`/psychologist/credentials/${id}/`, { method: "PATCH", body }),
  remove: (id: string) => api<void>(`/psychologist/credentials/${id}/`, { method: "DELETE" }),
  upload: (id: string, file: File, isPublic: boolean) => {
    const fd = new FormData();
    fd.append("file", file, file.name);
    fd.append("is_public", isPublic ? "1" : "0");
    return api<CredentialFileInfo>(`/psychologist/credentials/${id}/files/`, { method: "POST", body: fd });
  },
  setPublic: (fileId: string, isPublic: boolean) =>
    api<CredentialFileInfo>(`/psychologist/credentials/files/${fileId}/`, { method: "PATCH", body: { is_public: isPublic } }),
  removeFile: (fileId: string) => api<void>(`/psychologist/credentials/files/${fileId}/`, { method: "DELETE" }),
  reply: (id: string, text: string) =>
    api<Credential>(`/psychologist/credentials/${id}/notes/`, { method: "POST", body: { text } }),

  public: (psychologistId: number) => api<PublicCredential[]>(`/psychologists/${psychologistId}/credentials/`, { auth: false }),

  staffList: (q: { status?: CredentialStatus; q?: string; page?: number; specialist?: number }) =>
    api<{
      count: number;
      page: number;
      pages: number;
      results: StaffCredential[];
      counts: Record<CredentialStatus, number>;
    }>("/staff/credentials/", { query: q as Record<string, string | number | undefined> }),
  staffGet: (id: string) => api<StaffCredential>(`/staff/credentials/${id}/`),
  staffDecide: (id: string, decision: "approve" | "reject" | "request_info", comment = "") =>
    api<StaffCredential>(`/staff/credentials/${id}/`, { method: "POST", body: { decision, comment } }),
};

/** API path returned by the backend ("/api/v1/…") → URL against the configured API base. */
export function apiUrl(path: string): string {
  return path.startsWith("/api/v1/") ? `${API_BASE}${path.slice("/api/v1".length)}` : path;
}

/** Private documents: fetch with the JWT and hand back an object URL (caller revokes it). */
export async function fetchPrivateFile(path: string): Promise<string> {
  const res = await fetch(apiUrl(path), {
    headers: tokens.access ? { Authorization: `Bearer ${tokens.access}` } : {},
  });
  if (!res.ok) throw new Error(res.status === 404 ? t("Файл не\u00a0найден или\u00a0нет доступа.") : t("Не\u00a0получилось открыть файл."));
  return URL.createObjectURL(await res.blob());
}

export function periodLabel(c: { year: number | null; year_end: number | null }): string {
  if (c.year && c.year_end && c.year_end !== c.year) return `${c.year}–${c.year_end}`;
  return c.year ? String(c.year) : "";
}

export function fileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return t(`{v} КБ`, { v: Math.max(1, Math.round(bytes / 1024)) });
  return t(`{v} МБ`, { v: (bytes / 1024 / 1024).toFixed(1).replace(".", ",") });
}
