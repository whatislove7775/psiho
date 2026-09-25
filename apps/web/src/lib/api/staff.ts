/** Staff console API (/api/v1/staff/…) and user reports (/api/v1/reports/…). See docs/API.md. */
import type { AvatarConfig } from "@/lib/avatar/schema";
import { api, API_BASE, ApiError } from "./client";
import type { AuthResponse, SessionStatus, VerificationStatus } from "./types";

export type StaffRole = "owner" | "admin" | "moderator" | "support" | "developer" | "editor";

export type StaffPermission =
  | "dashboard.view"
  | "dashboard.revenue"
  | "users.view"
  | "users.block"
  | "users.logout"
  | "users.identity"
  | "specialists.view"
  | "specialists.verify"
  | "specialists.edit"
  | "specialists.suspend"
  | "sessions.view"
  | "sessions.cancel"
  | "sessions.refund"
  | "reports.view"
  | "reports.resolve"
  | "content.edit"
  | "content.publish"
  | "support.inbox"
  | "support.reply"
  | "audit.view"
  | "system.view"
  | "lab.use"
  | "finance.view"
  | "finance.manage"
  | "staff.view"
  | "staff.manage";

export const STAFF_ROLE_LABEL: Record<StaffRole, string> = {
  owner: "Владелец",
  admin: "Администратор",
  moderator: "Модератор",
  support: "Поддержка",
  developer: "Разработчик",
  editor: "Редактор",
};

export interface StaffMe {
  user_id: string;
  alias: string;
  role: StaffRole;
  role_label: string;
  permissions: StaffPermission[];
  totp_enabled: boolean;
  totp_required: boolean;
  must_change_password: boolean;
}

export interface Page<T> {
  count: number;
  page: number;
  pages: number;
  results: T[];
}

export interface HealthCheck {
  status: "ok" | "error";
  latency_ms: number;
  error?: string;
  engine?: string;
  backend?: string;
  redis?: boolean;
}

export interface HealthSummary {
  status: "ok" | "degraded";
  db: HealthCheck;
  cache: HealthCheck;
  channels: HealthCheck;
}

export interface AuditEntry {
  id: number;
  at: string;
  actor: { id: string | null; alias: string; role: string };
  action: string;
  target: { type: string; id: string; label: string };
  details: Record<string, unknown>;
  ip: string | null;
  user_agent: string;
}

export interface Dashboard {
  users: { clients: number; new_week: number; blocked: number };
  specialists: { active: number; pending: number; suspended: number };
  sessions: { today: number; week: number; upcoming: number; cancelled_week: number };
  reports: { open: number; in_review: number };
  support: { unread: number } | null;
  revenue: { month_rub: number; month_fee_rub: number; week_rub: number } | null;
  series: { date: string; sessions: number }[];
  system: (HealthSummary & { errors_24h: number }) | null;
  recent_audit: AuditEntry[] | null;
}

export interface StaffUserRow {
  id: string;
  alias: string;
  role: "client" | "psychologist" | "admin";
  staff_role: StaffRole | null;
  is_active: boolean;
  blocked: boolean;
  block_reason: string;
  blocked_at: string | null;
  avatar_config: AvatarConfig | null;
  date_joined: string;
  last_login: string | null;
  specialist: { id: number; display_name: string; verification_status: VerificationStatus } | null;
  sessions_total?: number;
  reports_open?: number;
  has_email?: boolean;
}

export interface StaffSessionRow {
  id: string;
  status: SessionStatus;
  scheduled_at: string;
  duration_minutes: number;
  amount_rub: number;
  created_at: string;
  client: { id: string; alias: string; avatar_config: AvatarConfig | null };
  specialist: { id: number; display_name: string; avatar_config: AvatarConfig | null };
  payment: { status: string; refunded_at: string | null; provider: string } | null;
  platform_fee_rub?: number;
  payout_rub?: number;
}

export interface StaffSessionDetail extends StaffSessionRow {
  completed_at: string | null;
  events: { type: string; label: string; at: string; meta: Record<string, unknown> }[];
  reports: number;
}

export interface StaffUserDetail extends StaffUserRow {
  sessions: StaffSessionRow[] | null;
  reports_received: number;
  reports_sent: number;
  history: AuditEntry[] | null;
}

export interface StaffSpecialist {
  id: number;
  user_id: string;
  alias: string;
  display_name: string;
  avatar_config: AvatarConfig | null;
  photo_url: string | null;
  verification_status: VerificationStatus;
  rejection_reason: string;
  specializations: string[];
  languages: string[];
  experience_years: number;
  /** Price of the shortest session («от …»), derived from hourly_rate_rub */
  session_rate_rub: number;
  hourly_rate_rub: number | null;
  created_at: string;
  verified_at: string | null;
  verified_by: string | null;
  is_active: boolean;
  blocked: boolean;
  documents: { full_name: boolean; diploma: boolean; phone: boolean; photo: boolean };
  bio: string;
  approach: string;
  stats?: { completed: number; upcoming: number; cancelled: number };
  reports_open?: number;
  schedule_rules?: number;
}

export type SpecialistDecision = "approve" | "reject" | "suspend" | "reinstate";

export type ReportTarget = "user" | "specialist" | "session" | "message";
export type ReportReason =
  | "abuse"
  | "harassment"
  | "spam"
  | "fraud"
  | "unprofessional"
  | "inappropriate"
  | "safety"
  | "other";
export type ReportStatus = "open" | "in_review" | "resolved" | "dismissed";
export type ReportAction = "none" | "warn" | "block_user" | "suspend_specialist" | "cancel_session";

export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: "abuse", label: "Оскорбления или угрозы" },
  { value: "harassment", label: "Преследование" },
  { value: "spam", label: "Спам или реклама" },
  { value: "fraud", label: "Мошенничество" },
  { value: "unprofessional", label: "Непрофессиональное поведение" },
  { value: "inappropriate", label: "Недопустимый контент" },
  { value: "safety", label: "Угроза жизни или безопасности" },
  { value: "other", label: "Другое" },
];

export interface ReportPublic {
  id: number;
  target_type: ReportTarget;
  reason: ReportReason;
  reason_label: string;
  status: ReportStatus;
  status_label: string;
  created_at: string;
}

export interface StaffReport extends ReportPublic {
  comment: string;
  reporter: { id: string | null; alias: string; role: string | null };
  target: {
    user: { id: string; alias: string; role: string; is_active: boolean; avatar_config: AvatarConfig | null } | null;
    specialist: { id: number; display_name: string; verification_status: VerificationStatus } | null;
    session: { id: string; status: SessionStatus; scheduled_at: string } | null;
    message_id: string | null;
  };
  assignee: string | null;
  resolution_action: ReportAction | null;
  resolution_note: string;
  resolved_by: string | null;
  resolved_at: string | null;
  target_reports_total: number;
}

export interface SystemStatus {
  health: HealthSummary;
  version: {
    commit: string | null;
    commit_short: string | null;
    version: string | null;
    built_at: string | null;
    python: string;
    django: string;
    debug: boolean;
    started_at: string;
    uptime_seconds: number;
  };
  migrations: { status: "ok" | "pending" | "error"; pending: string[]; pending_count: number; applied_count?: number };
  errors: { total: number; hourly: number[]; recent: { at: string; path: string; status: number | null; error: string }[] };
  integrations: { yookassa: boolean };
  security: { staff_2fa_required: boolean; staff_without_2fa: number };
  counts: { users: number; sessions: number; audit_entries: number };
}

export interface StaffMemberRow {
  user_id: string;
  alias: string;
  role: StaffRole;
  role_label: string;
  is_active: boolean;
  totp_enabled: boolean;
  must_change_password: boolean;
  note: string;
  created_at: string;
  created_by: string | null;
  last_login: string | null;
  avatar_config: AvatarConfig | null;
}

export interface StaffMembers {
  results: StaffMemberRow[];
  roles: { value: StaffRole; label: string; manageable: boolean }[];
  matrix: { perm: StaffPermission; label: string; roles: StaffRole[] }[];
}

type Q = Record<string, string | number | undefined | null>;
const post = <T>(path: string, body?: unknown) => api<T>(path, { method: "POST", body: body ?? {} });

export const staffApi = {
  me: () => api<StaffMe>("/staff/me/"),
  changePassword: (old_password: string, new_password: string) =>
    post<AuthResponse>("/staff/me/password/", { old_password, new_password }),
  totpSetup: () => post<{ secret: string; otpauth_url: string }>("/staff/me/2fa/setup/"),
  totpEnable: (code: string) => post<{ totp_enabled: boolean }>("/staff/me/2fa/enable/", { code }),
  totpDisable: (code: string) => post<{ totp_enabled: boolean }>("/staff/me/2fa/disable/", { code }),

  dashboard: () => api<Dashboard>("/staff/dashboard/"),

  users: (q: Q) => api<Page<StaffUserRow>>("/staff/users/", { query: q }),
  user: (id: string) => api<StaffUserDetail>(`/staff/users/${id}/`),
  block: (id: string, reason: string) => post<StaffUserRow>(`/staff/users/${id}/block/`, { reason }),
  unblock: (id: string, reason = "") => post<StaffUserRow>(`/staff/users/${id}/unblock/`, { reason }),
  forceLogout: (id: string) => post<{ detail: string }>(`/staff/users/${id}/logout/`),

  specialists: (q: Q) =>
    api<Page<StaffSpecialist> & { counts: Record<VerificationStatus, number> }>("/staff/specialists/", { query: q }),
  specialist: (id: number) => api<StaffSpecialist>(`/staff/specialists/${id}/`),
  editSpecialist: (id: number, body: Partial<StaffSpecialist>) =>
    api<StaffSpecialist>(`/staff/specialists/${id}/`, { method: "PATCH", body }),
  decide: (id: number, decision: SpecialistDecision, reason = "") =>
    post<StaffSpecialist>(`/staff/specialists/${id}/decision/`, { decision, reason }),

  sessions: (q: Q) => api<Page<StaffSessionRow>>("/staff/sessions/", { query: q }),
  session: (id: string) => api<StaffSessionDetail>(`/staff/sessions/${id}/`),
  cancelSession: (id: string, reason: string, refund: boolean) =>
    post<StaffSessionDetail>(`/staff/sessions/${id}/cancel/`, { reason, refund }),

  reports: (q: Q) => api<Page<StaffReport> & { counts: Record<ReportStatus, number> }>("/staff/reports/", { query: q }),
  assignReport: (id: number) => post<StaffReport>(`/staff/reports/${id}/assign/`),
  resolveReport: (id: number, status: "resolved" | "dismissed", action: ReportAction, note: string) =>
    post<StaffReport>(`/staff/reports/${id}/resolve/`, { status, action, note }),

  audit: (q: Q) => api<Page<AuditEntry>>("/staff/audit/", { query: q }),
  system: () => api<SystemStatus>("/staff/system/"),

  members: () => api<StaffMembers>("/staff/members/"),
  createMember: (login: string, role: StaffRole, note = "") =>
    post<{ member: StaffMemberRow; one_time_password: string }>("/staff/members/", { login, role, note }),
  updateMember: (id: string, body: { role?: StaffRole; note?: string }) =>
    api<StaffMemberRow>(`/staff/members/${id}/`, { method: "PATCH", body }),
  memberAction: (id: string, action: "deactivate" | "activate" | "reset-password" | "reset-2fa") =>
    post<{ member: StaffMemberRow; one_time_password?: string }>(`/staff/members/${id}/${action}/`),
};

/** «Пожаловаться» — for any signed-in client or specialist. */
export const reportsApi = {
  create: (target_type: ReportTarget, target_id: string, reason: ReportReason, comment = "") =>
    post<ReportPublic>("/reports/", { target_type, target_id, reason, comment }),
  mine: () => api<ReportPublic[]>("/reports/mine/"),
};

/** Thrown by loginWithOtp when the account has 2FA and needs a code. */
export class OtpRequiredError extends ApiError {
  constructor(message: string) {
    super(400, message);
  }
}

/** Login that understands the staff second factor ({"otp_required": true}). */
export async function loginWithOtp(login: string, password: string, otp?: string): Promise<AuthResponse> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/auth/login/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(otp ? { login, password, otp } : { login, password }),
    });
  } catch {
    throw new ApiError(0, "Нет соединения с сервером. Проверьте интернет.");
  }
  const data = await res.json().catch(() => null);
  if (res.ok) return data as AuthResponse;
  if (data && data.otp_required) throw new OtpRequiredError(String(data.detail || "Введите код"));
  if (res.status === 429) throw new ApiError(429, "Слишком много попыток. Подождите минуту.");
  if (res.status >= 500) throw new ApiError(res.status, "Сервер временно недоступен. Попробуйте через минуту.");
  const detail = data && typeof data.detail === "string" ? data.detail : null;
  const first = data && !detail ? Object.values(data as Record<string, unknown>).flat()[0] : null;
  throw new ApiError(res.status, detail || (first ? String(first) : "Не получилось войти."));
}
