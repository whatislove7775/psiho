import { OG_SIZE, OG_TYPE, ogCard } from "@/lib/og/card";
import { OG } from "@/lib/og/sections";

/**
 * Landing link preview: logo + the big three-line headline, no captions.
 * Next.js puts a hash of THIS file into the og:image URL, so editing only lib/og/* keeps the old URL
 * and Telegram/VK keep serving their cached picture. Bump the revision when the card changes.
 * Revision: 2 (headline-only card).
 */
export const alt = OG.home.alt;
export const size = OG_SIZE;
export const contentType = OG_TYPE;

export default function Image() {
  return ogCard(OG.home);
}
