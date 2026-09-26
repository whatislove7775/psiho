/** Dialogues API (/api/v1/dialogues/) — see docs/API.md «Диалоги». A dialogue = chat of a client↔specialist pair + calls. */
import type { AvatarConfig } from "@/lib/avatar/schema";
import { api } from "./client";
import type { CallBrief, ChatRole, Conversation, DialogCard, ProposalBrief, Retention, SenderRole } from "./chat";

export type DialogKind = "specialist" | "support" | "ai";
export type DialogStatus = "live" | "scheduled" | "awaiting_payment" | "proposal" | "open";

export interface DialogCounterpart {
  type: "specialist" | "client" | "support" | "ai";
  name: string;
  avatar_config: AvatarConfig | null;
  psychologist_id?: number;
  photo_url?: string | null;
  bio?: string;
  specializations?: string[];
  experience_years?: number;
}

export interface CallInfo extends CallBrief {
  ends_at: string;
  /** until this moment the client cancels / reschedules for free */
  free_until: string;
  completed_at: string | null;
  actual_minutes?: number | null;
  can_cancel?: boolean;
  can_reschedule?: boolean;
  late_cancel?: boolean;
  /** client + awaiting payment only */
  payment_url?: string | null;
  pay_mode?: "balance" | "external";
}

export interface DialogItem {
  /** conversation id, or "support" / "ai" before the conversation exists */
  id: string;
  conversation_id: string | null;
  kind: DialogKind;
  pinned: boolean;
  my_role: ChatRole;
  counterpart: DialogCounterpart;
  last_message: { text: string; created_at: string; sender_role: SenderRole; kind: string; card?: DialogCard | null } | null;
  last_message_at: string | null;
  unread: number;
  retention: Retention;
  next_call: CallInfo | null;
  calls_count: number;
  status: DialogStatus;
}

export interface DialogFile {
  message_id: string;
  name: string;
  mime: string;
  size: number;
  created_at: string;
  mine: boolean;
}

export interface DurationOption {
  minutes: number;
  price_rub: number;
}

export interface DialogDetail extends DialogItem {
  conversation: Conversation;
  calls: CallInfo[];
  proposals: ProposalBrief[];
  files: DialogFile[];
  booking: {
    hourly_rate_rub: number;
    min_duration: number;
    max_duration: number;
    durations: DurationOption[];
    intro?: import("./availability").IntroInfo;
  };
  rules: { free_cancel_hours: number; late_penalty_percent: number | null; first_messages: number };
  pay_mode: "balance" | "external";
  can_book: boolean;
  can_propose: boolean;
  /** null — no limit; otherwise messages the client may still send before the specialist replies */
  first_messages_left: number | null;
}

export interface DialogStarts {
  duration_minutes: number;
  price_rub: number;
  durations: DurationOption[];
  horizon_until: string;
  starts: string[];
  intro?: import("./availability").IntroInfo;
}

export interface CancelResult {
  call: CallInfo;
  refund: "full" | "partial" | "none";
  late: boolean;
}

export const dialogsApi = {
  list: () => api<DialogItem[]>("/dialogues/"),
  get: (id: string) => api<DialogDetail>(`/dialogues/${id}/`),
  startWithSpecialist: (psychologist_id: number) =>
    api<DialogDetail>("/dialogues/", { method: "POST", body: { psychologist_id } }),
  startWithClient: (client_alias: string) => api<DialogDetail>("/dialogues/", { method: "POST", body: { client_alias } }),
  /** book from a specialist's profile: the dialogue is created together with the call */
  bookWith: (psychologist_id: number, scheduled_at: string, duration_minutes: number) =>
    api<CallInfo & { dialogue_id: string }>("/dialogues/book/", {
      method: "POST",
      body: { psychologist_id, scheduled_at, duration_minutes },
    }),
  starts: (id: string, duration?: number) => api<DialogStarts>(`/dialogues/${id}/starts/`, { query: { duration } }),
  book: (id: string, scheduled_at: string, duration_minutes: number) =>
    api<CallInfo>(`/dialogues/${id}/calls/`, { method: "POST", body: { scheduled_at, duration_minutes } }),
  reschedule: (id: string, callId: string, scheduled_at: string) =>
    api<CallInfo>(`/dialogues/${id}/calls/${callId}/reschedule/`, { method: "POST", body: { scheduled_at } }),
  cancel: (id: string, callId: string) => api<CancelResult>(`/dialogues/${id}/calls/${callId}/cancel/`, { method: "POST" }),
  propose: (id: string, scheduled_at: string, duration_minutes: number) =>
    api<ProposalBrief>(`/dialogues/${id}/proposals/`, { method: "POST", body: { scheduled_at, duration_minutes } }),
  accept: (id: string, proposalId: string) =>
    api<CallInfo>(`/dialogues/${id}/proposals/${proposalId}/accept/`, { method: "POST" }),
  closeProposal: (id: string, proposalId: string) =>
    api<ProposalBrief>(`/dialogues/${id}/proposals/${proposalId}/close/`, { method: "POST" }),
  note: (id: string) => api<{ text: string; updated_at: string | null }>(`/dialogues/${id}/note/`),
  saveNote: (id: string, text: string) =>
    api<{ text: string; updated_at: string | null }>(`/dialogues/${id}/note/`, { method: "PUT", body: { text } }),
};

export function dialogHref(role: ChatRole, id: string): string {
  return `${role === "specialist" ? "/pro" : "/app"}/dialogs?d=${encodeURIComponent(id)}`;
}
