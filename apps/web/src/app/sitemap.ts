import type { MetadataRoute } from "next";
import { serverContent } from "@/lib/content/server";
import { SITE_URL } from "@/lib/seo";
import { LEGAL_DOCS } from "@/components/legal/docs";

// Rendered on request from the 5-minute content cache: CMS changes show up without a deploy.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [articles, practices] = await Promise.all([serverContent.articles(), serverContent.practices()]);
  const now = new Date();
  const page = (path: string, priority: number, changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"], lastModified: Date | string = now) => ({
    url: `${SITE_URL}${path}`,
    lastModified,
    changeFrequency,
    priority,
    alternates: { languages: { ru: `${SITE_URL}${path}` } },
  });
  const newest = (dates: (string | null | undefined)[]) => dates.filter(Boolean).sort().at(-1) ?? now;

  return [
    page("/", 1, "weekly"),
    page("/start", 0.9, "monthly"),
    page("/articles", 0.8, "weekly", newest(articles.map((a) => a.updated_at ?? a.published_at))),
    ...articles.map((a) => page(`/articles/${a.slug}`, 0.7, "monthly", a.updated_at ?? a.published_at ?? now)),
    page("/practices", 0.6, "monthly", newest(practices.map((p) => p.updated_at))),
    ...practices.map((p) => page(`/practices/${p.slug}`, 0.5, "monthly", p.updated_at ?? now)),
    page("/join", 0.6, "monthly"),
    page("/login", 0.3, "yearly"),
    page("/legal", 0.2, "yearly"),
    ...LEGAL_DOCS.map((d) => page(`/legal/${d.slug}`, 0.2, "yearly")),
  ];
}
