import { OG_SIZE, OG_TYPE, ogCard } from "@/lib/og/card";
import { OG, OG_MAX_TITLE } from "@/lib/og/sections";
import { isSlug, serverContent } from "@/lib/content/server";

export const alt = OG.article.alt;
export const size = OG_SIZE;
export const contentType = OG_TYPE;
export const revalidate = 300;

/** The article's own title (if it fits) over the section card; falls back to the section card. */
export default async function Image({ params }: { params: { slug: string } }) {
  const a = isSlug(params.slug) ? await serverContent.article(params.slug).catch(() => null) : null;
  if (!a || a.title.length > OG_MAX_TITLE) return ogCard(OG.article);
  const minutes = a.reading_minutes ? `${a.reading_minutes} мин чтения` : "";
  return ogCard({
    ...OG.article,
    kicker: a.topic_label ? `Статья · ${a.topic_label}` : OG.article.kicker,
    title: a.title,
    subtitle: [minutes, "со ссылками на исследования"].filter(Boolean).join(", "),
  });
}
