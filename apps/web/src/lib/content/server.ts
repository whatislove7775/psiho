/**
 * Server-side reads of public content (articles/practices) for SEO pages, sitemap and llms.txt.
 *
 * Runs only on the Next.js server. Talks to Django directly over the internal network
 * (INTERNAL_API_URL, e.g. http://api:8000/api/v1 in docker-compose) with a Host header Django
 * accepts, and caches results in the Next data cache for a few minutes so public pages stay fast.
 */
import http from "node:http";
import https from "node:https";
import { unstable_cache } from "next/cache";
import type { Article, ArticleCard, Practice, PracticeCard, TopicCount } from "@/lib/api/content";
import { SITE_URL } from "@/lib/seo";

const REVALIDATE = 300;

function apiBase(): string {
  const explicit = process.env.INTERNAL_API_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const proxy = process.env.API_PROXY; // local dev (next dev with a Django dev server)
  if (proxy) return `${proxy.replace(/\/$/, "")}/api/v1`;
  const pub = process.env.NEXT_PUBLIC_API_URL;
  if (pub && /^https?:\/\//.test(pub)) return pub.replace(/\/$/, "");
  return "http://127.0.0.1:8000/api/v1";
}

class NotFound extends Error {}

/** GET JSON from Django. Node's fetch drops a custom Host header, so use http(s).request. */
function getJson<T>(path: string): Promise<T> {
  const url = new URL(apiBase() + path);
  const lib = url.protocol === "https:" ? https : http;
  const host = process.env.INTERNAL_API_HOST || new URL(SITE_URL).host;
  return new Promise<T>((resolve, reject) => {
    const req = lib.request(
      url,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          // Django checks ALLOWED_HOSTS; the internal hostname (e.g. "api") isn't in it.
          ...(process.env.INTERNAL_API_URL ? { Host: host, "X-Forwarded-Proto": "https" } : {}),
        },
        timeout: 8000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const status = res.statusCode ?? 0;
          if (status === 404) return reject(new NotFound(path));
          if (status < 200 || status >= 300) return reject(new Error(`API ${status} for ${path}`));
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")) as T);
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error(`API timeout for ${path}`)));
    req.on("error", reject);
    req.end();
  });
}

/** Cached read; a missing item resolves to null (so pages can call notFound()). */
function cached<T>(key: string, path: string): Promise<T | null> {
  return unstable_cache(
    async () => {
      try {
        return await getJson<T>(path);
      } catch (e) {
        if (e instanceof NotFound) return null;
        throw e;
      }
    },
    ["content", key],
    { revalidate: REVALIDATE, tags: ["content"] },
  )();
}

/** Lists fail soft: an unreachable API renders an empty section instead of a 500. */
async function list<T>(key: string, path: string): Promise<T[]> {
  try {
    return (await cached<T[]>(key, path)) ?? [];
  } catch (e) {
    console.error("[content] list failed", path, (e as Error).message);
    return [];
  }
}

export const serverContent = {
  articles: (q: { topic?: string; limit?: number } = {}) => {
    const qs = new URLSearchParams();
    if (q.topic) qs.set("topic", q.topic);
    if (q.limit) qs.set("limit", String(q.limit));
    const s = qs.toString();
    return list<ArticleCard>(`articles?${s}`, `/content/articles/${s ? `?${s}` : ""}`);
  },
  topics: () => list<TopicCount>("topics", "/content/topics/"),
  practices: () => list<PracticeCard>("practices", "/content/practices/"),
  article: (slug: string) => cached<Article>(`article:${slug}`, `/content/articles/${encodeURIComponent(slug)}/`),
  practice: (slug: string) => cached<Practice>(`practice:${slug}`, `/content/practices/${encodeURIComponent(slug)}/`),
};

/** Valid public slug (keeps junk out of the cache and the API). */
export function isSlug(s: string): boolean {
  return /^[a-z0-9-]{1,120}$/.test(s);
}
