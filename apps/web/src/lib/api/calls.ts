/** Calls API (/api/v1/calls/) — call rating, problem reports, lobby presence. See docs/API.md «Звонки». */
import { api } from "./client";

export type CallIssue =
  | "no_audio"
  | "echo"
  | "voice_breaks"
  | "no_video"
  | "video_freezes"
  | "avatar_lags"
  | "avatar_wrong"
  | "voice_filter"
  | "disconnects"
  | "other";

/** Connection numbers only (no media, no message text). */
export type CallTech = Record<string, string | number | boolean | null>;

export const callsApi = {
  feedback: (
    sessionId: string,
    body: { kind: "rating" | "problem"; rating?: number; issues?: CallIssue[]; comment?: string; tech?: CallTech },
  ) => api<{ id: number; kind: string; rating: number | null }>(`/calls/${sessionId}/feedback/`, { method: "POST", body }),
  presence: (sessionId: string) => api<{ peer_in_room: boolean }>(`/calls/${sessionId}/presence/`),
};
