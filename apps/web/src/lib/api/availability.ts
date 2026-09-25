/** Flexible scheduling: specialist availability (cabinet) and free start times (public). See docs/API.md. */
import { api } from "./client";

export interface TimeRange {
  start: string; // "HH:MM"
  end: string; // "HH:MM", may be "24:00"
}

export interface WeeklyTemplate {
  id?: number;
  valid_from: string | null; // YYYY-MM-DD
  valid_until: string | null;
  /** 7 lists, 0 = Monday */
  days: TimeRange[][];
}

export interface DurationPrice {
  minutes: number;
  price_rub: number;
}

export interface AvailabilitySettings {
  time_zone: string;
  min_duration: number;
  max_duration: number;
  durations: number[];
  allowed_durations: number[];
  buffer_minutes: number;
  min_notice_minutes: number;
  horizon_days: number;
  start_step_minutes: number;
  hourly_rate_rub: number;
  prices: DurationPrice[];
  platform_fee_percent: number;
  templates: WeeklyTemplate[];
  options: {
    durations: number[];
    buffer_minutes: number[];
    min_notice_minutes: number[];
    horizon_days: number[];
    start_step_minutes: number[];
  };
}

export type AvailabilityUpdate = Partial<
  Pick<
    AvailabilitySettings,
    | "time_zone"
    | "min_duration"
    | "max_duration"
    | "durations"
    | "buffer_minutes"
    | "min_notice_minutes"
    | "horizon_days"
    | "start_step_minutes"
    | "hourly_rate_rub"
    | "templates"
  >
>;

export interface CalendarDay {
  date: string;
  source: "template" | "override" | "time_off" | "none";
  has_override: boolean;
  time_off_id: number | null;
  ranges: TimeRange[];
  sessions: TimeRange[];
}

export interface CalendarResponse {
  time_zone: string;
  today: string;
  days: CalendarDay[];
}

export interface TimeOff {
  id: number;
  start_date: string;
  end_date: string;
  note: string;
}

export interface AvailableStarts {
  duration_minutes: number;
  price_rub: number;
  durations: DurationPrice[];
  horizon_until: string;
  starts: string[];
}

/** Booking info embedded into the public psychologist card. */
export interface BookingInfo {
  hourly_rate_rub: number;
  min_duration: number;
  max_duration: number;
  durations: DurationPrice[];
}

export const availabilityApi = {
  get: () => api<AvailabilitySettings>("/psychologist/availability/"),
  save: (body: AvailabilityUpdate) => api<AvailabilitySettings>("/psychologist/availability/", { method: "PUT", body }),
  calendar: (from: string, to: string) =>
    api<CalendarResponse>("/psychologist/availability/calendar/", { query: { from, to } }),
  setDay: (date: string, ranges: TimeRange[]) =>
    api<{ date: string; ranges: TimeRange[] }>(`/psychologist/availability/overrides/${date}/`, {
      method: "PUT",
      body: { ranges },
    }),
  resetDay: (date: string) => api<void>(`/psychologist/availability/overrides/${date}/`, { method: "DELETE" }),
  timeOff: () => api<TimeOff[]>("/psychologist/availability/time-off/"),
  addTimeOff: (body: { start_date: string; end_date: string; note?: string }) =>
    api<TimeOff>("/psychologist/availability/time-off/", { method: "POST", body }),
  removeTimeOff: (id: number) => api<void>(`/psychologist/availability/time-off/${id}/`, { method: "DELETE" }),
  /** Free start times for a duration; dates are in the specialist's zone, times come back in UTC. */
  starts: (psychologistId: number, duration: number, from?: string, to?: string) =>
    api<AvailableStarts>(`/psychologists/${psychologistId}/available-starts/`, {
      query: { duration, from, to },
      auth: false,
    }),
};

/** "50 мин", "1 ч", "1,5 ч", "1 ч 20 мин" */
export function durationLabel(min: number): string {
  if (min < 60) return `${min} мин`;
  if (min % 60 === 0) return `${min / 60} ч`;
  if (min % 30 === 0) return `${String(min / 60).replace(".", ",")} ч`;
  return `${Math.floor(min / 60)} ч ${min % 60} мин`;
}

/** Price for a duration from the hourly rate, rounded to 10 ₽ (same rule as the backend). */
export function priceFor(hourly: number, minutes: number): number {
  return Math.round((hourly * minutes) / 60 / 10) * 10;
}
