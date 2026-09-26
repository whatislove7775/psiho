/** Types mirroring /docs/API.md — keep in sync with the backend contract. */
import type { AvatarConfig } from "@/lib/avatar/schema";

export type Role = "client" | "psychologist" | "admin" | "business";
export type VerificationStatus = "pending" | "approved" | "rejected" | "suspended";
export type SessionStatus =
  | "awaiting_payment"
  | "paid"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "refunded";

export interface PsychologistPublic {
  id: number;
  display_name: string;
  bio: string;
  approach: string;
  specializations: string[];
  languages: string[];
  experience_years: number;
  session_rate_rub: number;
  avatar_config: AvatarConfig | null;
  /** real photo of the specialist (square 512px), null if not uploaded */
  photo_url?: string | null;
  sessions_count: number;
  next_slot: string | null;
  /** durations & prices set by the specialist (see lib/api/availability.ts); session_rate_rub = shortest session price */
  booking?: import("./availability").BookingInfo;
  /** optional, set by the specialist; clients can filter by it in search */
  gender?: "" | "female" | "male";
  /** average of published reviews (1 decimal), null — no reviews yet (lib/api/reviews.ts) */
  rating?: number | null;
  reviews_count?: number;
  /** approved credentials (lib/api/credentials.ts); > 0 → «Проверено aprosop» */
  verified_credentials?: number;
}

export interface PsychologistPrivate extends PsychologistPublic {
  verification_status: VerificationStatus;
  created_at?: string;
}

export interface User {
  id: string;
  alias: string;
  role: Role;
  avatar_config: AvatarConfig | null;
  has_email: boolean;
  created_at: string;
  psychologist: PsychologistPrivate | null;
}

export interface AuthResponse {
  access: string;
  refresh: string;
  user: User;
  recovery_key?: string;
}

export interface Slot {
  start: string;
  end: string;
}

export interface ScheduleRule {
  /** 0 = Monday … 6 = Sunday */
  weekday: number;
  start_time: string; // "HH:MM"
  end_time: string;
}

export interface SessionParty {
  id?: number;
  display_name?: string;
  alias?: string;
  avatar_config: AvatarConfig | null;
}

export interface Session {
  id: string;
  status: SessionStatus;
  scheduled_at: string;
  /** booked length, 50…180 minutes */
  duration_minutes: number;
  amount_rub: number;
  room_id: string;
  can_join: boolean;
  psychologist: { id: number; display_name: string; avatar_config: AvatarConfig | null; photo_url?: string | null };
  client: { alias: string; avatar_config: AvatarConfig | null };
  payment_url: string | null;
  /** dialogue of the pair (= chat conversation id); the call lives inside it */
  dialogue_id?: string | null;
  conversation_id?: string | null;
}

export interface JoinResponse {
  room_id: string;
  ws_token: string;
  role: "client" | "psychologist";
  peer: { name: string; avatar_config: AvatarConfig | null; photo_url?: string | null };
  /** chat of the dialogue for the in-call panel (<DialogThread conversationId compact />) */
  conversation_id?: string;
  dialogue_id?: string;
}

export interface PsychologistStats {
  upcoming: number;
  sessions_month: number;
  sessions_total: number;
  earnings_month_rub: number;
  earnings_total_rub: number;
  clients_total: number;
}

export interface AdminStats {
  clients: number;
  psychologists: number;
  pending: number;
  sessions_today: number;
  sessions_month: number;
  revenue_month_rub: number;
}

export interface PsychologistFilters {
  q?: string;
  specialization?: string;
  max_rate?: number;
}
