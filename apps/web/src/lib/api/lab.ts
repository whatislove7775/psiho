/** Staff lab: test call rooms (/api/v1/lab/…). See docs/API.md → «Лаборатория». */
import type { AvatarConfig } from "@/lib/avatar/schema";
import { api } from "./client";
import type { JoinResponse } from "./types";

export type LabRole = "client" | "psychologist";

export interface TestRoom {
  id: string;
  label: string;
  created_at: string;
  expires_at: string;
  is_active: boolean;
  has_client_avatar: boolean;
  /** signed invite tokens, one per side; the link is /room/<id>?lab=<token> */
  tokens: Record<LabRole, string>;
}

export interface LabJoinResponse extends JoinResponse {
  test_room: { id: string; label: string; created_at: string; expires_at: string; client_avatar: AvatarConfig | null };
}

export const labApi = {
  rooms: () => api<{ results: TestRoom[]; ttl_minutes: number }>("/lab/rooms/"),
  create: (body: { label?: string; client_avatar?: AvatarConfig | null } = {}) =>
    api<TestRoom>("/lab/rooms/", { method: "POST", body }),
  close: (id: string) => api<TestRoom>(`/lab/rooms/${id}/close/`, { method: "POST" }),
  /** Public: the invite token is the credential (works on a phone that isn't logged in). */
  join: (token: string) => api<LabJoinResponse>("/lab/join/", { method: "POST", body: { token }, auth: false }),
};

export function labLink(room: TestRoom, role: LabRole, origin = typeof window !== "undefined" ? window.location.origin : ""): string {
  return `${origin}/room/${room.id}?lab=${encodeURIComponent(room.tokens[role])}`;
}
