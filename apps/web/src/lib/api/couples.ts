import { api } from "./client";
import type { CircleDetail, MyCircleRow, ProCircleRow } from "./circles";
export interface PairPreview {
  host: { name: string };
  starts_at: string;
  minutes: number;
  paid: boolean;
}
export const couplesApi = {
  book: (
    psychologist_id: number,
    scheduled_at: string,
    expected_price_rub: number,
    expected_minutes: number,
  ) =>
    api<CircleDetail>("/circles/couples/book/", {
      method: "POST",
      body: {
        psychologist_id,
        scheduled_at,
        expected_price_rub,
        expected_minutes,
      },
    }),
  mine: () =>
    api<{ results: MyCircleRow[] }>("/circles/mine/", {
      query: { session_format: "couple" },
    }),
  pro: () =>
    api<{ results: ProCircleRow[] }>("/circles/pro/", {
      query: { session_format: "couple" },
    }),
  invite: (id: string) =>
    api<{ token: string }>(`/circles/couples/${id}/invite/`, {
      method: "POST",
    }),
  preview: (token: string) =>
    api<PairPreview>("/circles/couples/invitation/preview/", {
      method: "POST",
      body: { token },
    }),
  accept: (token: string) =>
    api<CircleDetail>("/circles/couples/invitation/accept/", {
      method: "POST",
      body: { token, consent: true },
    }),
  cancel: (id: string) =>
    api<CircleDetail>(`/circles/couples/${id}/cancel/`, { method: "POST" }),
};
