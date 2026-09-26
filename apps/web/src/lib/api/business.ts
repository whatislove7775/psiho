/** B2B «Для компаний» (/api/v1/business/…): client allowances, HR portal (aggregates only), staff console. See docs/API.md. */
import { api, API_BASE, ApiError, tokens } from "./client";

export type Service = "calls" | "circles" | "ai";
export type Period = "month" | "quarter" | "year";

export const SERVICE_LABEL: Record<Service, string> = {
  calls: "Созвоны со специалистом",
  circles: "Групповые «Круги»",
  ai: "ИИ-помощник",
};
export const PERIOD_LABEL: Record<Period, string> = { month: "месяц", quarter: "квартал", year: "год" };

/* ── client ─────────────────────────────────────────────────────── */

export interface MyProgram {
  id: string;
  company: string;
  program: string;
  services: Service[];
  period: Period;
  amount_kopecks: number | null;
  calls_limit: number | null;
  rub_left_kopecks: number | null;
  calls_left: number | null;
  renews_on: string | null;
  expires_on: string | null;
  active: boolean;
  budget_ok: boolean;
}

/* ── shared shapes ──────────────────────────────────────────────── */

export interface Program {
  id: string;
  name: string;
  amount_kopecks: number | null;
  calls_limit: number | null;
  period: Period;
  services: Service[];
  starts_on: string | null;
  expires_on: string | null;
  is_active: boolean;
}

export interface Company {
  id: string;
  name: string;
  legal_name: string;
  inn: string;
  plan: "pilot" | "standard" | "enterprise";
  plan_label: string;
  status: "active" | "paused" | "closed";
  status_label: string;
  contract_number: string;
  created_at: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  note?: string;
}

export interface MonthRow {
  month: string;
  label: string;
  spent_kopecks: number;
  people: number | null;
  calls: number | null;
  hours: number | null;
}

export interface Dashboard {
  k_min: number;
  current_month: string;
  company: Company;
  program: Program | null;
  budget: {
    as_of: string;
    balance_at_month_start_kopecks: number;
    topups_this_month_kopecks: number;
    available_kopecks: number;
    low: boolean;
    topped_up_total_kopecks: number;
  };
  totals: { spent_kopecks: number; people: number | null; calls: number | null };
  codes: { issued: number; activated: number | null; active_participants: number | null; as_of: string };
  monthly: MonthRow[];
  topics: { visible: boolean; rows: { topic: string; label: string; share: number }[]; other_share: number | null };
  satisfaction: { visible: boolean; average: number | null; count: number | null };
}

export interface Batch {
  id: string;
  label: string;
  count: number;
  revoked: boolean;
  program: string;
  created_month: string;
}

export interface Invoice {
  id: string;
  number: string;
  amount_kopecks: number;
  status: "issued" | "paid" | "canceled";
  status_label: string;
  created_at: string;
  paid_at: string | null;
  requested_by_company: boolean;
}

export interface Act {
  month: string;
  label: string;
  amount_kopecks: number;
  calls: number | null;
}

export interface PortalMe {
  company: Company;
  admin: { login: string; full_name: string };
  must_change_password: boolean;
  support: { email: string; hours: string; manager: string };
  k_min: number;
}

export interface Documents {
  company: Company;
  contract: { number: string | null; status: string; note: string };
  invoices: Invoice[];
  acts: Act[];
  k_min: number;
  requisites: { name: string; inn: string; note: string };
}

export interface HrAdmin {
  id: number;
  login: string;
  full_name: string;
  is_active: boolean;
  must_change_password: boolean;
  created_at: string;
}

export interface StaffCompanyRow extends Company {
  budget_kopecks: number;
  admins: number;
  open_invoices: number;
}

export interface StaffCompanyDetail {
  company: Company;
  budget_kopecks: number;
  programs: Program[];
  admins: HrAdmin[];
  batches: Batch[];
  invoices: Invoice[];
  stats: Omit<Dashboard, "company" | "program">;
}

export interface Lead {
  id: string;
  company_name: string;
  contact_name: string;
  contact: string;
  employees: number | null;
  message: string;
  status: "new" | "in_progress" | "done";
  status_label: string;
  company_id: string | null;
  created_at: string;
}

export interface ProgramInput {
  name?: string;
  amount_rub?: number | string | null;
  calls_limit?: number | string | null;
  period?: Period;
  services?: Service[];
  starts_on?: string | null;
  expires_on?: string | null;
  is_active?: boolean;
}

/** Download a CSV that needs the bearer token. */
async function downloadCsv(path: string, filename: string) {
  const res = await fetch(`${API_BASE}${path}`, { headers: tokens.access ? { Authorization: `Bearer ${tokens.access}` } : {} });
  if (!res.ok) throw new ApiError(res.status, "Не получилось скачать файл.");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Save codes that are shown once (right after generation) as CSV. */
export function saveCodesCsv(codes: string[], name = "aprosop-codes.csv") {
  const rows = ["Код;Как активировать", ...codes.map((c) => `${c};aprosop.ru → Баланс → Программа компании`)];
  const blob = new Blob(["﻿" + rows.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const businessApi = {
  // public
  lead: (body: { company_name: string; contact_name?: string; contact: string; employees?: number | null; message?: string; website?: string }) =>
    api<{ ok: true }>("/business/leads/", { method: "POST", body, auth: false }),
  // client
  mine: () => api<{ programs: MyProgram[] }>("/business/me/"),
  redeem: (code: string) => api<{ programs: MyProgram[] }>("/business/redeem/", { method: "POST", body: { code } }),
  leave: (id: string) => api<{ programs: MyProgram[] }>(`/business/me/${id}/leave/`, { method: "POST" }),
  // HR portal
  portalMe: () => api<PortalMe>("/business/portal/me/"),
  changePassword: (old_password: string, new_password: string) =>
    api<{ ok: true }>("/business/portal/me/password/", { method: "POST", body: { old_password, new_password } }),
  dashboard: () => api<Dashboard>("/business/portal/dashboard/"),
  codes: () => api<{ batches: Batch[]; codes: Dashboard["codes"]; k_min: number }>("/business/portal/codes/"),
  generate: (count: number, label: string) =>
    api<{ batch: Batch; codes: string[] }>("/business/portal/codes/", { method: "POST", body: { count, label } }),
  exportBatch: (id: string) => downloadCsv(`/business/portal/codes/${id}/export/`, `aprosop-codes-${id.slice(0, 8)}.csv`),
  revokeBatch: (id: string) => api<{ batch: Batch }>(`/business/portal/codes/${id}/revoke/`, { method: "POST" }),
  revokeCode: (code: string) => api<{ ok: true; detail: string }>("/business/portal/codes/revoke/", { method: "POST", body: { code } }),
  program: () =>
    api<{ program: Program | null; service_labels: Record<Service, string>; period_labels: Record<Period, string> }>(
      "/business/portal/program/",
    ),
  updateProgram: (body: ProgramInput) => api<{ program: Program }>("/business/portal/program/", { method: "PATCH", body }),
  documents: () => api<Documents>("/business/portal/documents/"),
  requestInvoice: (amount_rub: number) =>
    api<{ invoice: Invoice }>("/business/portal/documents/invoices/", { method: "POST", body: { amount_rub } }),
  actsCsv: () => downloadCsv("/business/portal/documents/acts.csv", "aprosop-acts.csv"),
  // staff
  staff: {
    companies: (q = "") => api<{ results: StaffCompanyRow[]; new_leads: number }>("/business/staff/companies/", { query: { q } }),
    create: (body: Record<string, unknown>) => api<StaffCompanyDetail>("/business/staff/companies/", { method: "POST", body }),
    company: (id: string) => api<StaffCompanyDetail>(`/business/staff/companies/${id}/`),
    update: (id: string, body: Record<string, unknown>) =>
      api<StaffCompanyDetail>(`/business/staff/companies/${id}/`, { method: "PATCH", body }),
    invite: (id: string, login: string, full_name: string) =>
      api<{ admin: HrAdmin; one_time_password: string }>(`/business/staff/companies/${id}/admins/`, {
        method: "POST",
        body: { login, full_name },
      }),
    updateAdmin: (id: string, adminId: number, body: { is_active?: boolean; reset_password?: boolean }) =>
      api<{ admin: HrAdmin; one_time_password?: string }>(`/business/staff/companies/${id}/admins/${adminId}/`, {
        method: "PATCH",
        body,
      }),
    createProgram: (id: string, body: ProgramInput) =>
      api<{ program: Program }>(`/business/staff/companies/${id}/programs/`, { method: "POST", body }),
    updateProgram: (programId: string, body: ProgramInput) =>
      api<{ program: Program }>(`/business/staff/programs/${programId}/`, { method: "PATCH", body }),
    generate: (id: string, count: number, label: string) =>
      api<{ batch: Batch; codes: string[] }>(`/business/staff/companies/${id}/codes/`, { method: "POST", body: { count, label } }),
    exportBatch: (batchId: string) => downloadCsv(`/business/staff/codes/${batchId}/export/`, `aprosop-codes-${batchId.slice(0, 8)}.csv`),
    issueInvoice: (id: string, amount_rub: number, note = "") =>
      api<{ invoice: Invoice }>(`/business/staff/companies/${id}/invoices/`, { method: "POST", body: { amount_rub, note } }),
    invoiceAction: (invoiceId: string, action: "paid" | "cancel") =>
      api<{ invoice: Invoice; budget_kopecks: number }>(`/business/staff/invoices/${invoiceId}/${action}/`, { method: "POST" }),
    adjust: (id: string, amount_rub: number, reason: string, idempotency_key: string) =>
      api<{ budget_kopecks: number }>(`/business/staff/companies/${id}/adjust/`, {
        method: "POST",
        body: { amount_rub, reason, idempotency_key },
      }),
    leads: (status?: string) => api<{ results: Lead[] }>("/business/staff/leads/", { query: { status } }),
    updateLead: (id: string, status: Lead["status"]) =>
      api<{ lead: Lead }>(`/business/staff/leads/${id}/`, { method: "PATCH", body: { status } }),
  },
};

/** «до 1 ноября» */
export function dateRu(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "long" }) {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Intl.DateTimeFormat("ru-RU", opts).format(new Date(y, m - 1, d)).replace(/\s?г\.$/, "");
}

export function monthRu(iso: string) {
  const s = dateRu(iso, { month: "long", year: "numeric" }).replace(" г.", "");
  return s.charAt(0).toUpperCase() + s.slice(1);
}
