/** Chats API (/api/v1/chat/) — see docs/API.md «Чаты». */
import type { AvatarConfig } from "@/lib/avatar/schema";
import { API_BASE, ApiError, api, tokens } from "./client";

export type ConversationKind = "specialist" | "client_support" | "specialist_support" | "ai";
export type ChatRole = "client" | "specialist" | "support";
export type SenderRole = "client" | "specialist" | "support" | "ai" | "system";
/** «Исчезающие сообщения»: forever — выкл (хранить всегда), 24h — 1 день, 1h — 1 час */
export type Retention = "1h" | "24h" | "forever";

export interface Counterpart {
  type: "specialist" | "client" | "support" | "ai";
  name: string;
  avatar_config: AvatarConfig | null;
  psychologist_id?: number;
  /** specialists appear with their real profile photo */
  photo_url?: string | null;
}

export interface ChatAttachment {
  name: string;
  mime: string;
  size: number;
  duration_ms: number | null;
  peaks: number[];
}

export interface CallBrief {
  id: string;
  status: "draft" | "awaiting_payment" | "paid" | "in_progress" | "completed" | "cancelled" | "refunded";
  scheduled_at: string;
  duration_minutes: number;
  amount_rub: number;
  can_join: boolean;
  /** H1: «Знакомство, 15 минут» */
  is_intro?: boolean;
}

export interface ProposalBrief {
  id: string;
  status: "pending" | "accepted" | "declined" | "withdrawn" | "expired";
  scheduled_at: string;
  duration_minutes: number;
  price_rub: number;
  session_id: string | null;
}

export interface DialogCard {
  type: "booked" | "rescheduled" | "cancelled" | "started" | "ended" | "proposed";
  call: CallBrief | null;
  proposal?: ProposalBrief | null;
  by?: "client" | "specialist";
  late?: boolean;
  minutes?: number | null;
}

export interface ChatMessage {
  id: string;
  conversation: string;
  kind: "text" | "voice" | "file" | "system";
  sender_role: SenderRole;
  text: string;
  system_code: string | null;
  /** call cards of a dialogue (system messages «call:*»), see lib/api/dialogs.ts */
  card?: DialogCard | null;
  attachment: ChatAttachment | null;
  created_at: string;
  edited_at: string | null;
  deleted: boolean;
  expires_at: string | null;
  mine: boolean;
  /** client-only: optimistic / streaming state */
  pending?: boolean;
  streaming?: boolean;
}

export interface Conversation {
  id: string;
  kind: ConversationKind;
  my_role: ChatRole;
  counterpart: Counterpart;
  retention: Retention;
  retention_changed_at: string | null;
  can_change_retention: boolean;
  /** «Защита от скриншотов» для обеих сторон (включает клиент) */
  screen_protect?: boolean;
  can_send_files: boolean;
  unread: number;
  last_message: { text: string; created_at: string; sender_role: SenderRole; kind: string } | null;
  last_message_at: string | null;
  peer_read_at: string | null;
  created_at: string;
}

export interface Contact {
  type: "specialist" | "client";
  name: string;
  avatar_config: AvatarConfig | null;
  psychologist_id?: number;
  client_alias?: string;
}

export interface AIStatus {
  name: string;
  enabled: boolean;
  consent: boolean;
  conversation_id: string | null;
  daily_limit: number;
  used_today: number;
  remaining_today: number;
}

export type StartWith =
  | { with: "support" }
  | { with: "specialist"; psychologist_id: number }
  | { with: "client"; client_alias: string };

export const chatApi = {
  conversations: (scope?: "support") => api<Conversation[]>("/chat/conversations/", { query: { scope } }),
  conversation: (id: string) => api<Conversation>(`/chat/conversations/${id}/`),
  start: (body: StartWith) => api<Conversation>("/chat/conversations/", { method: "POST", body }),
  contacts: () => api<Contact[]>("/chat/contacts/"),
  unread: () => api<{ total: number; support: number }>("/chat/unread/"),
  setRetention: (id: string, retention: Retention) =>
    api<Conversation>(`/chat/conversations/${id}/`, { method: "PATCH", body: { retention } }),
  setScreenProtect: (id: string, screen_protect: boolean) =>
    api<Conversation>(`/chat/conversations/${id}/`, { method: "PATCH", body: { screen_protect } }),
  clear: (id: string) => api<Conversation>(`/chat/conversations/${id}/clear/`, { method: "POST" }),
  read: (id: string) => api<{ read_at: string }>(`/chat/conversations/${id}/read/`, { method: "POST" }),
  messages: (id: string, before?: string, limit = 40) =>
    api<{ results: ChatMessage[]; has_more: boolean }>(`/chat/conversations/${id}/messages/`, {
      query: { before, limit },
    }),
  sendText: (id: string, text: string) =>
    api<ChatMessage>(`/chat/conversations/${id}/messages/`, { method: "POST", body: { text } }),
  edit: (msgId: string, text: string) => api<ChatMessage>(`/chat/messages/${msgId}/`, { method: "PATCH", body: { text } }),
  remove: (msgId: string, scope: "me" | "all") =>
    api<ChatMessage | undefined>(`/chat/messages/${msgId}/delete/`, { method: "POST", body: { for: scope } }),
  wsToken: () => api<{ token: string; expires_in: number }>("/chat/ws-token/", { method: "POST" }),
  ai: () => api<AIStatus>("/chat/ai/"),
  aiConsent: () => api<AIStatus>("/chat/ai/consent/", { method: "POST" }),
  aiRevoke: () => api<AIStatus>("/chat/ai/consent/", { method: "DELETE" }),
};

/** fetch with the JWT; on 401 lets the JSON client refresh tokens once and retries. */
async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const run = () => {
    const headers = new Headers(init.headers);
    const access = tokens.access;
    if (access) headers.set("Authorization", `Bearer ${access}`);
    return fetch(`${API_BASE}${path}`, { ...init, headers });
  };
  let res: Response;
  try {
    res = await run();
    if (res.status === 401 && tokens.refresh) {
      // api() transparently refreshes the access token
      await chatApi.unread().catch(() => undefined);
      res = await run();
    }
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError(0, "Нет соединения с сервером. Проверьте интернет.");
  }
  return res;
}

async function errorFrom(res: Response): Promise<ApiError> {
  let message = res.status === 413 ? "Файл слишком большой." : "Не получилось отправить.";
  let code: string | undefined;
  try {
    const data = await res.json();
    if (typeof data?.detail === "string") message = data.detail;
    else if (data && typeof data === "object") {
      const first = Object.values(data as Record<string, unknown>)[0];
      if (Array.isArray(first) && first[0]) message = String(first[0]);
      else if (typeof first === "string") message = first;
    }
    code = data?.code;
  } catch {
    /* not json */
  }
  const err = new ApiError(res.status, message);
  (err as ApiError & { code?: string }).code = code;
  return err;
}

export async function uploadMessage(
  convId: string,
  form: { kind: "voice" | "file"; file: Blob; filename: string; duration_ms?: number; peaks?: number[] },
): Promise<ChatMessage> {
  const fd = new FormData();
  fd.set("kind", form.kind);
  fd.set("file", form.file, form.filename);
  if (form.duration_ms) fd.set("duration_ms", String(Math.round(form.duration_ms)));
  if (form.peaks) fd.set("peaks", JSON.stringify(form.peaks.map((p) => Math.round(p * 1000) / 1000)));
  const res = await authedFetch(`/chat/conversations/${convId}/messages/`, { method: "POST", body: fd });
  if (!res.ok) throw await errorFrom(res);
  return res.json();
}

/** Decrypted attachment as an object URL (the endpoint needs the Authorization header). */
const blobCache = new Map<string, Promise<string>>();
export function attachmentUrl(msgId: string): Promise<string> {
  let p = blobCache.get(msgId);
  if (!p) {
    p = authedFetch(`/chat/messages/${msgId}/attachment/`).then(async (res) => {
      if (!res.ok) throw await errorFrom(res);
      return URL.createObjectURL(await res.blob());
    });
    p.catch(() => blobCache.delete(msgId));
    blobCache.set(msgId, p);
  }
  return p;
}

export function forgetAttachment(msgId: string) {
  const p = blobCache.get(msgId);
  if (p) p.then((u) => URL.revokeObjectURL(u)).catch(() => undefined);
  blobCache.delete(msgId);
}

export type AIStreamEvent =
  | { type: "user_message"; message: ChatMessage; remaining_today: number }
  | { type: "delta"; text: string }
  | { type: "replace"; text: string }
  | { type: "done"; message: ChatMessage; remaining_today: number }
  | { type: "error"; detail: string };

/** POST /chat/ai/reply/ and read the SSE stream. */
export async function streamAIReply(text: string, onEvent: (e: AIStreamEvent) => void, signal?: AbortSignal) {
  const res = await authedFetch("/chat/ai/reply/", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({ text }),
    signal,
  });
  if (!res.ok || !res.body) throw await errorFrom(res);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      for (const line of chunk.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        try {
          onEvent(JSON.parse(line.slice(6)) as AIStreamEvent);
        } catch {
          /* ignore malformed */
        }
      }
    }
  }
}
