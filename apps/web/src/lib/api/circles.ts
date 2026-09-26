/** «Круги» — group support circles (/api/v1/circles/, /api/v1/staff/circles/). See docs/API.md «Круги». */
import { api } from "./client";

export type CircleTopic =
  | "anxiety"
  | "burnout"
  | "breakup"
  | "grief"
  | "parenting"
  | "self_esteem"
  | "loneliness"
  | "relocation";
export type CircleStatus = "draft" | "pending" | "rejected" | "recruiting" | "running" | "finished" | "cancelled";
export type CircleBilling = "per_meeting" | "series";
export type CircleFormat = "series" | "single";
export type CircleRetention = "forever" | "24h" | "1h";
export type Tone = "sun" | "coral" | "cyan" | "lilac" | "mint";

export const TOPIC_LABEL: Record<CircleTopic, string> = {
  anxiety: "Тревога",
  burnout: "Выгорание",
  breakup: "Расставание",
  grief: "Горе и утрата",
  parenting: "Родительство",
  self_esteem: "Самооценка",
  loneliness: "Одиночество",
  relocation: "Переезд и эмиграция",
};

/** One topic = always one colour (design system accents). */
export const TOPIC_TONE: Record<CircleTopic, Tone> = {
  anxiety: "lilac",
  burnout: "sun",
  breakup: "coral",
  grief: "cyan",
  parenting: "mint",
  self_esteem: "coral",
  loneliness: "cyan",
  relocation: "sun",
};

export const STATUS_LABEL: Record<CircleStatus, string> = {
  draft: "Черновик",
  pending: "На проверке",
  rejected: "Нужны правки",
  recruiting: "Набор",
  running: "Идёт",
  finished: "Завершён",
  cancelled: "Отменён",
};
export const STATUS_TONE: Record<CircleStatus, "neutral" | "success" | "warning" | "danger" | "primary"> = {
  draft: "neutral",
  pending: "warning",
  rejected: "danger",
  recruiting: "success",
  running: "primary",
  finished: "neutral",
  cancelled: "danger",
};

export interface CircleHost {
  id: number;
  name: string;
  photo_url: string | null;
  experience_years: number;
  specializations: string[];
  bio?: string;
  verified_credentials?: number;
  status?: string;
}

export interface CircleMeeting {
  id: string;
  index: number;
  starts_at: string;
  ends_at: string;
  status: "scheduled" | "live" | "done" | "missed" | "cancelled";
  room_open: boolean;
}

export interface CircleCard {
  id: string;
  topic: CircleTopic;
  topic_label: string;
  title: string;
  summary: string;
  format: CircleFormat;
  meetings_count: number;
  meeting_minutes: number;
  capacity: number;
  seats_taken: number;
  seats_left: number;
  billing: CircleBilling;
  price_kopecks: number;
  total_kopecks: number;
  status: CircleStatus;
  status_label: string;
  first_meeting_at: string | null;
  next_meeting_at: string | null;
  host: CircleHost;
}

export interface LeaveTerms {
  refund_kopecks: number;
  penalty_kopecks: number;
  kept_kopecks: number;
}

export interface MyCircleState {
  status: "active" | "waitlist" | "left" | "removed";
  pseudonym: string;
  handle: string;
  tone: Tone;
  chat_muted: boolean;
  waitlist_position: number | null;
  promote_failed: boolean;
  leave_terms: LeaveTerms | null;
  payments: { held_kopecks: number; paid_kopecks: number; returned_kopecks: number } | null;
}

export interface CircleDetail extends CircleCard {
  description: string;
  rules: string[];
  allow_real_faces: boolean;
  chat_retention: CircleRetention;
  meetings: CircleMeeting[];
  waitlist_count: number;
  join_closed_reason: string | null;
  amount_due_kopecks: number;
  cancel_rules: { free_cancel_hours: number; late_cancel_penalty_percent: number };
  my_role: "host" | "member" | null;
  me: MyCircleState | null;
}

export interface CircleMember {
  handle: string;
  name: string;
  tone: Tone;
  is_me: boolean;
  chat_muted?: boolean;
}

export interface OwnerCircle extends CircleDetail {
  review_comment: string;
  submitted_at: string | null;
  reviewed_at: string | null;
  cancel_reason: string;
  editable: boolean;
  members: CircleMember[] | null;
  rules_text: string;
}

export interface ProCircleRow extends CircleCard {
  review_comment: string;
  members_count: number;
  waitlist_count: number;
}

export interface MyCircleRow extends CircleCard {
  me: { status: "active" | "waitlist"; pseudonym: string; tone: Tone; waitlist_position: number | null };
  next_meeting: CircleMeeting | null;
}

export interface CircleMessage {
  id: string;
  author: { kind: "member" | "host" | "system"; name: string; handle: string; tone: string };
  text: string;
  deleted: boolean;
  created_at: string;
  expires_at: string | null;
  mine?: boolean;
}

export interface CircleMessages {
  results: CircleMessage[];
  my_role: "host" | "member";
  me: { handle: string; name: string; tone: Tone; chat_muted: boolean } | null;
  writable: boolean;
  retention: CircleRetention;
}

export interface CircleWrite {
  topic: CircleTopic;
  title: string;
  description: string;
  rules: string;
  format: CircleFormat;
  meeting_minutes: number;
  capacity: number;
  billing: CircleBilling;
  price_rub: number;
  first_meeting_at: string;
  meetings_count: number;
  allow_real_faces: boolean;
  chat_retention: CircleRetention;
}

export interface MeetingJoin {
  ws_token: string;
  room_id: string;
  role: "host" | "member";
  self: { id: string; name: string; tone: string };
  circle: { id: string; title: string; topic: CircleTopic; topic_label: string; allow_real_faces: boolean };
  meeting: CircleMeeting;
  host: CircleHost;
  max_peers: number;
}

export const circlesApi = {
  list: (topic?: string) =>
    api<{ results: CircleCard[]; topics: { id: CircleTopic; label: string; count: number }[] }>("/circles/", {
      query: { topic },
      auth: true,
    }),
  mine: () => api<{ results: MyCircleRow[] }>("/circles/mine/"),
  get: (id: string) => api<CircleDetail>(`/circles/${id}/`),
  join: (id: string) => api<{ waitlisted: boolean; circle: CircleDetail }>(`/circles/${id}/join/`, { method: "POST" }),
  leave: (id: string) => api<CircleDetail>(`/circles/${id}/leave/`, { method: "POST" }),
  members: (id: string) => api<{ host: CircleHost; members: CircleMember[] }>(`/circles/${id}/members/`),
  messages: (id: string) => api<CircleMessages>(`/circles/${id}/messages/`),
  send: (id: string, text: string) => api<CircleMessage>(`/circles/${id}/messages/`, { method: "POST", body: { text } }),
  deleteMessage: (id: string, mid: string) => api<void>(`/circles/${id}/messages/${mid}/delete/`, { method: "POST" }),
  joinMeeting: (meetingId: string) => api<MeetingJoin>(`/circles/meetings/${meetingId}/join/`, { method: "POST" }),
  // specialist
  proList: () => api<{ results: ProCircleRow[] }>("/circles/pro/"),
  proGet: (id: string) => api<OwnerCircle>(`/circles/pro/${id}/`),
  proCreate: (body: CircleWrite) => api<OwnerCircle>("/circles/pro/", { method: "POST", body }),
  proUpdate: (id: string, body: Partial<CircleWrite>) => api<OwnerCircle>(`/circles/pro/${id}/`, { method: "PUT", body }),
  proDelete: (id: string) => api<void>(`/circles/pro/${id}/`, { method: "DELETE" }),
  proAction: (id: string, action: "submit" | "cancel", reason?: string) =>
    api<OwnerCircle>(`/circles/pro/${id}/action/`, { method: "POST", body: { action, reason } }),
  proModerate: (id: string, handle: string, action: "mute" | "unmute" | "remove") =>
    api<{ members: CircleMember[] }>(`/circles/pro/${id}/members/${handle}/`, { method: "POST", body: { action } }),
  proEndMeeting: (meetingId: string) => api<CircleMeeting>(`/circles/pro/meetings/${meetingId}/end/`, { method: "POST" }),
  // staff
  staffList: (status: string) =>
    api<{ results: (CircleCard & { submitted_at: string | null })[]; counts: Record<CircleStatus, number> }>("/staff/circles/", {
      query: { status },
    }),
  staffGet: (id: string) => api<OwnerCircle>(`/staff/circles/${id}/`),
  staffDecide: (id: string, decision: "approve" | "reject" | "cancel", comment = "") =>
    api<OwnerCircle>(`/staff/circles/${id}/`, { method: "POST", body: { decision, comment } }),
};

export function rubK0(kopecks: number): string {
  return `${Math.round(kopecks / 100).toLocaleString("ru-RU")} ₽`;
}

/** «900 ₽ за встречу» / «4 800 ₽ за цикл из 6 встреч» */
export function priceLine(c: Pick<CircleCard, "billing" | "price_kopecks" | "meetings_count" | "format">): string {
  if (c.format === "single") return `${rubK0(c.price_kopecks)} за встречу`;
  if (c.billing === "series") return `${rubK0(c.price_kopecks)} за весь цикл`;
  return `${rubK0(c.price_kopecks)} за встречу`;
}
