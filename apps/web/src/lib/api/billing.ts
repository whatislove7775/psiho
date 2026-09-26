/** Anonymous balance, top-ups, gift codes, earnings & payouts (/api/v1/billing/…). See docs/API.md. */
import { api, API_BASE, ApiError, tokens } from "./client";

/** Money comes as integer kopecks; format with rubK. */
export function rubK(kopecks: number, opts: { sign?: boolean; cents?: boolean } = {}): string {
  const v = kopecks / 100;
  const cents = opts.cents ?? kopecks % 100 !== 0;
  const s = new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  }).format(Math.abs(v));
  const sign = opts.sign ? (kopecks > 0 ? "+" : kopecks < 0 ? "−" : "") : kopecks < 0 ? "−" : "";
  return `${sign}${s} ₽`;
}

export interface TopUpSettings {
  providers: ("yookassa" | "mock")[];
  test_mode: boolean;
  min_kopecks: number;
  max_kopecks: number;
  presets_rub: number[];
  methods: { id: string; label: string }[];
  receipts: { enabled: boolean; required: boolean };
  confirmation: "redirect" | "embedded";
}

export interface BalanceSummary {
  balance_kopecks: number;
  held_kopecks: number;
  topup: TopUpSettings;
  cancel_rules: { free_cancel_hours: number; late_cancel_penalty_percent: number };
}

export interface CallHold {
  id: string;
  session_id: string;
  status: "active" | "captured" | "released" | "partial" | "refunded";
  amount_kopecks: number;
  returned_kopecks: number;
  reason: string;
  scheduled_at: string | null;
  duration_minutes: number;
  specialist: { name: string; photo_url: string | null } | null;
}

export interface TopUp {
  id: string;
  status: "pending" | "succeeded" | "canceled" | "refunded";
  amount_kopecks: number;
  provider: "yookassa" | "mock";
  test: boolean;
  method: string;
  created_at: string;
  paid_at: string | null;
  confirmation: { type: string; url: string | null; token: string | null } | null;
  balance_kopecks?: number;
}

export interface HistoryItem {
  id: string;
  kind: string;
  label: string;
  amount_kopecks: number;
  created_at: string;
  test: boolean;
  note?: string;
  call: CallHold | null;
}

export interface BalanceHistory {
  items: HistoryItem[];
  holds: CallHold[];
  pending_topups: TopUp[];
}

export interface CallPayment {
  session_id: string;
  status: string;
  scheduled_at: string;
  duration_minutes: number;
  amount_kopecks: number;
  specialist: { id: number; name: string; photo_url: string | null };
  hold: CallHold | null;
  paid: boolean;
  payable: boolean;
  balance_kopecks: number;
  shortfall_kopecks: number;
  /** part paid by the employer's program (apps.business), first in order */
  company_kopecks?: number;
}

export interface EarningsCall {
  id: string;
  session_id: string;
  scheduled_at: string | null;
  duration_minutes: number;
  client_alias: string;
  status: CallHold["status"];
  reason: string;
  gross_kopecks: number;
  fee_kopecks: number;
  net_kopecks: number;
  available: boolean;
  available_at: string | null;
}

export interface Payout {
  id: string;
  amount_kopecks: number;
  status: "requested" | "processing" | "paid" | "rejected" | "failed";
  rail: "manual" | "yookassa";
  destination: string;
  note: string;
  created_at: string;
  paid_at: string | null;
}

export type PayoutKind = "sbp" | "bank_account" | "card_token";
export type TaxStatus = "self_employed" | "ip";

export interface PayoutMethodInfo {
  kind: PayoutKind;
  masked: string;
  tax_status: TaxStatus;
  updated_at: string;
}

export interface Earnings {
  pending_kopecks: number;
  available_kopecks: number;
  in_payout_kopecks: number;
  paid_kopecks: number;
  upcoming_kopecks: number;
  fee_percent: number;
  hold_hours: number;
  payout_min_kopecks: number;
  payout_rail: "manual" | "yookassa";
  method: PayoutMethodInfo | null;
  calls: EarningsCall[];
  payouts: Payout[];
}

/** Server replies 402 with code "insufficient_funds" when the balance is short. */
export function isInsufficient(e: unknown): e is ApiError {
  return e instanceof ApiError && e.status === 402;
}

export const billingApi = {
  summary: () => api<BalanceSummary>("/billing/summary/"),
  history: (limit = 50) => api<BalanceHistory>("/billing/history/", { query: { limit } }),
  createTopUp: (body: { amount_rub: number; method?: string; receipt_email?: string; receipt_phone?: string; provider?: string; return_to?: string }) =>
    api<TopUp>("/billing/topups/", { method: "POST", body }),
  topUp: (id: string) => api<TopUp>(`/billing/topups/${id}/`),
  mockCheckout: (id: string, outcome: "succeeded" | "canceled") =>
    api<TopUp>(`/billing/topups/${id}/mock/`, { method: "POST", body: { outcome } }),
  redeem: (code: string) => api<{ amount_kopecks: number; balance_kopecks: number }>("/billing/redeem/", { method: "POST", body: { code } }),
  quote: (psychologist: number, minutes: number) =>
    api<{ amount_kopecks: number; balance_kopecks: number; enough: boolean; shortfall_kopecks: number }>("/billing/quote/", {
      query: { psychologist, minutes },
    }),
  call: (sessionId: string) => api<CallPayment>(`/billing/calls/${sessionId}/`),
  payCall: (sessionId: string) => api<CallPayment>(`/billing/calls/${sessionId}/pay/`, { method: "POST" }),
  earnings: () => api<Earnings>("/billing/earnings/"),
  setPayoutMethod: (body: Record<string, string>) => api<PayoutMethodInfo>("/billing/earnings/method/", { method: "PUT", body }),
  requestPayout: (amount_rub?: number) =>
    api<Payout>("/billing/earnings/payouts/", { method: "POST", body: amount_rub ? { amount_rub } : {} }),
};

// ── Staff (/admin/finance) ─────────────────────────────────────────

export interface FinanceOverview {
  clients_kopecks: number;
  holds_kopecks: number;
  spec_pending_kopecks: number;
  spec_available_kopecks: number;
  spec_payout_kopecks: number;
  platform_fee_kopecks: number;
  payouts_sent_kopecks: number;
  topups_live_kopecks: number;
  topups_test_kopecks: number;
  topups_month_kopecks: number;
  fee_month_kopecks: number;
  gifts_outstanding_kopecks: number;
  gifts_redeemed_kopecks: number;
  open_payouts: number;
  active_holds: number;
  ledger_ok: boolean;
  provider: {
    available: string[];
    yookassa_live: boolean;
    mock_enabled: boolean;
    payout_rail: "manual" | "yookassa";
    receipts_enabled: boolean;
    fee_percent: number;
    free_cancel_hours: number;
    late_cancel_penalty_percent: number;
    earnings_hold_hours: number;
  };
}

export interface StaffBalanceRow {
  user_id: string;
  alias: string;
  balance_kopecks: number;
  held_kopecks: number;
}

export interface StaffHoldRow {
  id: string;
  session_id: string;
  status: CallHold["status"];
  reason: string;
  amount_kopecks: number;
  specialist_kopecks: number;
  fee_kopecks: number;
  returned_kopecks: number;
  scheduled_at: string | null;
  duration_minutes: number;
  session_status: string | null;
  client_alias: string;
  specialist: string;
  matured: boolean;
  created_at: string;
  settled_at: string | null;
}

export interface StaffPayoutRow extends Payout {
  specialist: string;
  specialist_name: string;
  decided_at: string | null;
  provider_payout_id: string;
  tax_status?: TaxStatus | "";
}

export interface StaffTopUpRow {
  id: string;
  alias: string;
  provider: string;
  provider_payment_id: string;
  amount_kopecks: number;
  status: TopUp["status"];
  method: string;
  with_receipt: boolean;
  created_at: string;
  paid_at: string | null;
  refunded_kopecks: number;
}

export interface GiftBatchRow {
  id: string;
  label: string;
  amount_kopecks: number;
  count: number;
  redeemed: number;
  revoked: boolean;
  expires_at: string | null;
  created_at: string;
  created_by: string;
}

export interface JournalRow {
  id: string;
  kind: string;
  label: string;
  memo: string;
  created_at: string;
  session_id: string | null;
  entries: { account: string; key: string; amount_kopecks: number }[];
}

export interface Reconcile {
  ledger: {
    ok: boolean;
    total_kopecks: number;
    unbalanced_transactions: string[];
    cache_drift: { account: string; cached: number; entries: number }[];
    negative_user_accounts: string[];
  };
  provider: { checked: boolean; count?: number; error?: string };
  mismatches: { payment_id: string; problem: string; provider_status: string; our_status?: string; topup_id?: string }[];
  webhooks: { event: string; object_id: string; result: string; received_at: string }[];
}

type Items<T> = { items: T[] };

export const financeApi = {
  overview: () => api<FinanceOverview>("/billing/staff/overview/"),
  balances: (q = "") => api<Items<StaffBalanceRow>>("/billing/staff/balances/", { query: { q } }),
  holds: (status = "active") => api<Items<StaffHoldRow>>("/billing/staff/holds/", { query: { status } }),
  settleHold: (id: string, body: { action: "capture" | "release" | "penalty" | "refund"; reason: string; percent?: number }) =>
    api<StaffHoldRow>(`/billing/staff/holds/${id}/settle/`, { method: "POST", body }),
  payouts: (status = "open") => api<Items<StaffPayoutRow>>("/billing/staff/payouts/", { query: { status } }),
  payoutAction: (id: string, action: "approve" | "paid" | "reject", note = "") =>
    api<StaffPayoutRow>(`/billing/staff/payouts/${id}/${action}/`, { method: "POST", body: { note } }),
  payoutDetails: (id: string) =>
    api<{ kind: PayoutKind; tax_status: TaxStatus; details: Record<string, string> }>(`/billing/staff/payouts/${id}/details/`, {
      method: "POST",
    }),
  topups: (status = "all") => api<Items<StaffTopUpRow>>("/billing/staff/topups/", { query: { status } }),
  topupAction: (id: string, action: "refund" | "sync") =>
    api<{ id: string; status: string }>(`/billing/staff/topups/${id}/${action}/`, { method: "POST" }),
  adjust: (body: { alias: string; amount_rub: number; reason: string; key: string }) =>
    api<{ id: string; balance_kopecks: number }>("/billing/staff/adjust/", { method: "POST", body }),
  gifts: () => api<Items<GiftBatchRow>>("/billing/staff/gifts/"),
  createGifts: (body: { amount_rub: number; count: number; label?: string; expires_at?: string }) =>
    api<{ id: string; codes: string[] }>("/billing/staff/gifts/", { method: "POST", body }),
  revokeGifts: (id: string) => api<{ revoked: number }>(`/billing/staff/gifts/${id}/revoke/`, { method: "POST" }),
  journal: () => api<Items<JournalRow>>("/billing/staff/journal/"),
  reconcile: () => api<Reconcile>("/billing/staff/reconcile/"),
  sweep: () => api<Record<string, number>>("/billing/staff/sweep/", { method: "POST" }),
  /** CSV for the accountant (needs the auth header, so fetched as a blob). */
  async exportCsv(days = 31): Promise<Blob> {
    const r = await fetch(`${API_BASE}/billing/staff/export/?days=${days}`, {
      headers: tokens.access ? { Authorization: `Bearer ${tokens.access}` } : {},
    });
    if (!r.ok) throw new ApiError(r.status, "Не получилось выгрузить операции.");
    return r.blob();
  },
};

/** Small cross-component signal: balance changed → chips refresh. */
export const BALANCE_EVENT = "aprosop:balance";
export function notifyBalanceChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(BALANCE_EVENT));
}
