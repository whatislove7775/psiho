import { OG_SIZE, OG_TYPE, ogCard } from "@/lib/og/card";
import { OG, OG_MAX_TITLE } from "@/lib/og/sections";
import { isSlug, serverContent } from "@/lib/content/server";

export const alt = OG.practice.alt;
export const size = OG_SIZE;
export const contentType = OG_TYPE;
export const revalidate = 300;

/** The practice's own title (if it fits) over the section card; falls back to the section card. */
export default async function Image({ params }: { params: { slug: string } }) {
  const p = isSlug(params.slug) ? await serverContent.practice(params.slug).catch(() => null) : null;
  if (!p || p.title.length > OG_MAX_TITLE) return ogCard(OG.practice);
  return ogCard({
    ...OG.practice,
    kicker: p.kind_label ? `Практика · ${p.kind_label}` : OG.practice.kicker,
    title: p.title,
    subtitle: p.duration_minutes ? `${p.duration_minutes} мин, простые шаги по порядку` : OG.practice.subtitle,
  });
}
