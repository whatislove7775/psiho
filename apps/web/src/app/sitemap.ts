import type { MetadataRoute } from "next";
import { serverContent } from "@/lib/content/server";
import { SITE_URL } from "@/lib/seo";
import { LEGAL_DOCS } from "@/components/legal/docs";
import { DEFAULT_LOCALE, LOCALES, localePath } from "@/lib/i18n";

// Rendered on request from the 5-minute content cache: CMS changes show up without a deploy.
export const dynamic = "force-dynamic";

type Entry = MetadataRoute.Sitemap[number];

/**
 * Every public page in every language (/, /en, /articles, /en/articles…) with hreflang alternates.
 * Articles and practices are listed once, in their own language: they have no translations.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [articles, practices] = await Promise.all([serverContent.articles(), serverContent.practices()]);
  const now = new Date();
  const abs = (p: string) => `${SITE_URL}${p}`;
  const languages = (path: string) => {
    const out: Record<string, string> = { "x-default": abs(localePath(path, DEFAULT_LOCALE)) };
    for (const l of LOCALES) out[l] = abs(localePath(path, l));
    return out;
  };
  const page = (path: string, priority: number, changeFrequency: Entry["changeFrequency"], lastModified: Date | string = now): Entry[] =>
    LOCALES.map((l) => ({
      url: abs(localePath(path, l)),
      lastModified,
      changeFrequency,
      // Russian is the main market; English copies are slightly less important for crawl budget
      priority: l === DEFAULT_LOCALE ? priority : Math.round(priority * 8) / 10,
      alternates: { languages: languages(path) },
    }));
  const single = (path: string, language: string | undefined, priority: number, lastModified: Date | string): Entry => {
    const url = abs(localePath(path, language === "en" ? "en" : "ru"));
    return { url, lastModified, changeFrequency: "monthly", priority, alternates: { languages: { [language || "ru"]: url } } };
  };
  const newest = (dates: (string | null | undefined)[]) => dates.filter(Boolean).sort().at(-1) ?? now;

  return [
    ...page("/", 1, "weekly"),
    ...page("/start", 0.9, "monthly"),
    ...page("/match", 0.8, "monthly"),
    ...page("/articles", 0.8, "weekly", newest(articles.map((a) => a.updated_at ?? a.published_at))),
    ...articles.map((a) => single(`/articles/${a.slug}`, a.language, 0.7, a.updated_at ?? a.published_at ?? now)),
    ...page("/practices", 0.6, "monthly", newest(practices.map((p) => p.updated_at))),
    ...practices.map((p) => single(`/practices/${p.slug}`, p.language, 0.5, p.updated_at ?? now)),
    ...page("/join", 0.6, "monthly"),
    // «Для компаний» is a Russian B2B programme — Russian only
    { url: abs("/business"), lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    ...page("/login", 0.3, "yearly"),
    ...page("/legal", 0.2, "yearly"),
    ...LEGAL_DOCS.flatMap((d) => page(`/legal/${d.slug}`, 0.2, "yearly")),
  ];
}
