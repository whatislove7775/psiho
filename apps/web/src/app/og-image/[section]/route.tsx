import { ogCard } from "@/lib/og/card";
import { OG } from "@/lib/og/sections";

/**
 * Link-preview card in another language: /og-image/<section>?lang=en.
 * Russian pages keep the file-based opengraph-image.tsx images; pages in other languages point here
 * (lib/og/sections.ts ogMeta), because the file-based URL is the same for every language.
 * The middleware turns ?lang= into the request locale, so OG texts come out translated.
 */
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { section: string } }) {
  const card = OG[params.section] ?? OG.home;
  const res = await ogCard(card);
  res.headers.set("Cache-Control", "public, max-age=86400, s-maxage=86400");
  return res;
}
