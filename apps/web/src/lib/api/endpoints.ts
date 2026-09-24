/** Every backend call the frontend makes. Paths follow /docs/API.md. */
import type { AvatarConfig } from "@/lib/avatar/schema";
import { api } from "./client";
import type {
  AdminStats,
  AuthResponse,
  JoinResponse,
  PsychologistFilters,
  PsychologistPrivate,
  PsychologistPublic,
  PsychologistStats,
  ScheduleRule,
  Session,
  Slot,
  User,
} from "./types";

export const authApi = {
  anonymous: (password: string) =>
    api<AuthResponse>("/auth/anonymous/", { method: "POST", body: { password }, auth: false }),
  registerPsychologist: (body: {
    email: string;
    password: string;
    display_name: string;
    bio: string;
    specializations: string[];
    session_rate_rub: number;
    experience_years: number;
  }) => api<AuthResponse>("/auth/register/psychologist/", { method: "POST", body, auth: false }),
  login: (login: string, password: string) =>
    api<AuthResponse>("/auth/login/", { method: "POST", body: { login, password }, auth: false }),
  recover: (alias: string, recovery_key: string, new_password: string) =>
    api<AuthResponse>("/auth/recover/", { method: "POST", body: { alias, recovery_key, new_password }, auth: false }),
  me: () => api<User>("/auth/me/"),
  updateMe: (body: { avatar_config?: AvatarConfig }) => api<User>("/auth/me/", { method: "PATCH", body }),
  changePassword: (old_password: string, new_password: string) =>
    api<void>("/auth/me/password/", { method: "POST", body: { old_password, new_password } }),
  deleteAccount: (password: string) => api<void>("/auth/me/delete/", { method: "POST", body: { password } }),
};

export const psychologistsApi = {
  list: (filters: PsychologistFilters = {}) =>
    api<PsychologistPublic[]>("/psychologists/", { query: { ...filters } }),
  get: (id: number) => api<PsychologistPublic>(`/psychologists/${id}/`),
  slots: (id: number, from: string, days = 14) =>
    api<Slot[]>(`/psychologists/${id}/slots/`, { query: { from, days } }),
};

export const cabinetApi = {
  profile: () => api<PsychologistPrivate>("/psychologist/profile/"),
  updateProfile: (body: Partial<PsychologistPrivate>) =>
    api<PsychologistPrivate>("/psychologist/profile/", { method: "PATCH", body }),
  schedule: () => api<ScheduleRule[]>("/psychologist/schedule/"),
  saveSchedule: (rules: ScheduleRule[]) =>
    api<ScheduleRule[]>("/psychologist/schedule/", { method: "PUT", body: rules }),
  stats: () => api<PsychologistStats>("/psychologist/stats/"),
};

export const sessionsApi = {
  list: () => api<Session[]>("/sessions/"),
  get: (id: string) => api<Session>(`/sessions/${id}/`),
  book: (psychologist_id: number, scheduled_at: string, duration_minutes: 50 | 80) =>
    api<Session>("/sessions/book/", { method: "POST", body: { psychologist_id, scheduled_at, duration_minutes } }),
  cancel: (id: string) => api<Session>(`/sessions/${id}/cancel/`, { method: "POST" }),
  join: (id: string) => api<JoinResponse>(`/sessions/${id}/join/`, { method: "POST" }),
  complete: (id: string) => api<Session>(`/sessions/${id}/complete/`, { method: "POST" }),
};

export const adminApi = {
  psychologists: (status = "pending") =>
    api<PsychologistPrivate[]>("/admin-panel/psychologists/", { query: { status } }),
  verify: (id: number, status: "approved" | "rejected" | "suspended") =>
    api<PsychologistPrivate>(`/admin-panel/psychologists/${id}/verify/`, { method: "POST", body: { status } }),
  stats: () => api<AdminStats>("/admin-panel/stats/"),
  sessions: () => api<Session[]>("/admin-panel/sessions/"),
};
