/**
 * Specialist search (command palette + /app/specialists).
 * Backend: GET /psychologists/search/, GET /psychologists/ (same filters), GET /psychologists/popular-requests/.
 * Search queries are never stored on the server.
 */
import { api } from "./client";
import type { PsychologistPublic } from "./types";

export type WhenFilter = "today" | "3days" | "evening" | "weekend";
export type GenderFilter = "female" | "male";
export type SortOrder = "relevance" | "soon" | "price" | "experience";

export interface SpecialistQuery {
  q?: string;
  /** requests / topics — any of them */
  topics?: string[];
  approach?: string;
  max_rate?: number;
  when?: WhenFilter;
  duration?: number;
  min_experience?: number;
  gender?: GenderFilter;
  language?: string;
  sort?: SortOrder;
}

export interface SearchResult {
  count: number;
  results: (PsychologistPublic & { gender?: "" | GenderFilter })[];
}

export interface Facet {
  label: string;
  count: number;
}

export interface SearchFacets {
  popular: Facet[];
  topics: Facet[];
  approaches: { value: string; label: string; count: number }[];
  languages: Facet[];
  durations: number[];
  genders: { value: GenderFilter; count: number }[];
  price: { min: number; max: number };
  when: { value: WhenFilter; label: string }[];
}

const clientTz = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
};

function toParams(q: SpecialistQuery): Record<string, string | number | undefined> {
  return {
    q: q.q?.trim() || undefined,
    topics: q.topics?.length ? q.topics.join(",") : undefined,
    approach: q.approach,
    max_rate: q.max_rate,
    when: q.when,
    duration: q.duration,
    min_experience: q.min_experience,
    gender: q.gender,
    language: q.language,
    sort: q.sort && q.sort !== "relevance" ? q.sort : undefined,
    tz: q.when ? clientTz() : undefined,
  };
}

export const searchApi = {
  search: (q: SpecialistQuery, limit = 6, signal?: AbortSignal) =>
    api<SearchResult>("/psychologists/search/", { query: { ...toParams(q), limit }, signal, auth: false }),
  list: (q: SpecialistQuery, signal?: AbortSignal) =>
    api<PsychologistPublic[]>("/psychologists/", { query: toParams(q), signal, auth: false }),
  facets: () => api<SearchFacets>("/psychologists/popular-requests/", { auth: false }),
};

// ── URL <-> filters (the «Показать всех» link and /app/specialists) ────────────

const WHEN_VALUES: WhenFilter[] = ["today", "3days", "evening", "weekend"];
const SORT_VALUES: SortOrder[] = ["relevance", "soon", "price", "experience"];

export function queryToSearchParams(q: SpecialistQuery): URLSearchParams {
  const p = new URLSearchParams();
  if (q.q?.trim()) p.set("q", q.q.trim());
  q.topics?.forEach((t) => p.append("topic", t));
  if (q.approach) p.set("approach", q.approach);
  if (q.max_rate) p.set("max_rate", String(q.max_rate));
  if (q.when) p.set("when", q.when);
  if (q.duration) p.set("duration", String(q.duration));
  if (q.min_experience) p.set("min_experience", String(q.min_experience));
  if (q.gender) p.set("gender", q.gender);
  if (q.language) p.set("language", q.language);
  if (q.sort && q.sort !== "relevance") p.set("sort", q.sort);
  return p;
}

export function searchParamsToQuery(p: URLSearchParams | null | undefined): SpecialistQuery {
  if (!p) return {};
  const num = (k: string) => {
    const v = Number(p.get(k));
    return Number.isFinite(v) && v > 0 ? v : undefined;
  };
  const when = p.get("when") as WhenFilter | null;
  const gender = p.get("gender");
  const sort = p.get("sort") as SortOrder | null;
  const topics = [...p.getAll("topic"), ...(p.get("topics")?.split(",") ?? [])].map((t) => t.trim()).filter(Boolean);
  return {
    q: p.get("q") ?? undefined,
    topics: topics.length ? Array.from(new Set(topics)) : undefined,
    approach: p.get("approach") || undefined,
    max_rate: num("max_rate"),
    when: when && WHEN_VALUES.includes(when) ? when : undefined,
    duration: num("duration"),
    min_experience: num("min_experience"),
    gender: gender === "female" || gender === "male" ? gender : undefined,
    language: p.get("language") || undefined,
    sort: sort && SORT_VALUES.includes(sort) ? sort : undefined,
  };
}

/** Number of active filters (not counting the text). */
export function activeFilters(q: SpecialistQuery): number {
  return (
    (q.topics?.length ?? 0) +
    [q.approach, q.max_rate, q.when, q.duration, q.min_experience, q.gender, q.language].filter(Boolean).length
  );
}
