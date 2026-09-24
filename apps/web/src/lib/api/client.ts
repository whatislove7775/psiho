/**
 * Minimal typed fetch wrapper with JWT + transparent refresh.
 * Tokens live in localStorage (the only thing we persist about the user).
 */

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/api/v1";

const ACCESS = "aprosop.access";
const REFRESH = "aprosop.refresh";

export class ApiError extends Error {
  status: number;
  fields: Record<string, string[]>;
  constructor(status: number, message: string, fields: Record<string, string[]> = {}) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

function read(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export const tokens = {
  get access() {
    return read(ACCESS);
  },
  get refresh() {
    return read(REFRESH);
  },
  set(access: string, refresh?: string) {
    try {
      localStorage.setItem(ACCESS, access);
      if (refresh) localStorage.setItem(REFRESH, refresh);
    } catch {
      /* private mode — session-only auth */
    }
  },
  clear() {
    try {
      localStorage.removeItem(ACCESS);
      localStorage.removeItem(REFRESH);
    } catch {
      /* ignore */
    }
  },
};

let refreshing: Promise<boolean> | null = null;

async function refreshTokens(): Promise<boolean> {
  const refresh = tokens.refresh;
  if (!refresh) return false;
  if (!refreshing) {
    refreshing = fetch(`${API_BASE}/auth/token/refresh/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh }),
    })
      .then(async (r) => {
        if (!r.ok) return false;
        const data = await r.json();
        tokens.set(data.access, data.refresh);
        return true;
      })
      .catch(() => false)
      .finally(() => {
        setTimeout(() => (refreshing = null), 0);
      });
  }
  return refreshing;
}

function messageFrom(data: unknown, status: number): { message: string; fields: Record<string, string[]> } {
  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    if (typeof d.detail === "string") return { message: d.detail, fields: {} };
    const fields: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(d)) {
      if (Array.isArray(v)) fields[k] = v.map(String);
      else if (typeof v === "string") fields[k] = [v];
    }
    const first = Object.values(fields)[0]?.[0];
    if (first) return { message: first, fields };
  }
  if (status >= 500) return { message: "Сервер временно недоступен. Попробуйте через минуту.", fields: {} };
  if (status === 0) return { message: "Нет соединения с сервером. Проверьте интернет.", fields: {} };
  return { message: "Не получилось выполнить запрос.", fields: {} };
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  auth?: boolean;
  query?: Record<string, string | number | undefined | null>;
  signal?: AbortSignal;
}

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, auth = true, query, signal } = opts;
  let url = `${API_BASE}${path}`;
  if (query) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
    const s = qs.toString();
    if (s) url += `?${s}`;
  }

  const doFetch = () => {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const access = auth ? tokens.access : null;
    if (access) headers.Authorization = `Bearer ${access}`;
    return fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal });
  };

  let res: Response;
  try {
    res = await doFetch();
    if (res.status === 401 && auth && tokens.refresh) {
      if (await refreshTokens()) res = await doFetch();
    }
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError(0, messageFrom(null, 0).message);
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (!res.ok) {
    if (res.status === 401 && auth) tokens.clear();
    const { message, fields } = messageFrom(data, res.status);
    throw new ApiError(res.status, message, fields);
  }
  return data as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
