import type { Session } from "@/lib/api/types";

const LIVE = new Set(["awaiting_payment", "paid", "in_progress"]);

export function sessionEnd(s: Session): number {
  return new Date(s.scheduled_at).getTime() + s.duration_minutes * 60000;
}

/** Still ahead of the client (or running right now). */
export function isUpcoming(s: Session, now = Date.now()): boolean {
  return LIVE.has(s.status) && sessionEnd(s) > now;
}

/** Upcoming sessions, soonest first; past ones, newest first. */
export function splitSessions(list: Session[]) {
  const now = Date.now();
  const upcoming = list
    .filter((s) => isUpcoming(s, now))
    .sort((a, b) => +new Date(a.scheduled_at) - +new Date(b.scheduled_at));
  const past = list
    .filter((s) => !isUpcoming(s, now))
    .sort((a, b) => +new Date(b.scheduled_at) - +new Date(a.scheduled_at));
  return { upcoming, past };
}

export function canCancel(s: Session): boolean {
  return (
    (s.status === "paid" || s.status === "awaiting_payment") &&
    new Date(s.scheduled_at).getTime() > Date.now()
  );
}

/** Remember locally that the camera check was passed (per-device convenience only). */
const CHECK_KEY = "aprosop.checkDone";
export const checkDone = {
  get(): boolean {
    try {
      return localStorage.getItem(CHECK_KEY) === "1";
    } catch {
      return false;
    }
  },
  set() {
    try {
      localStorage.setItem(CHECK_KEY, "1");
    } catch {
      /* private mode */
    }
  },
};
