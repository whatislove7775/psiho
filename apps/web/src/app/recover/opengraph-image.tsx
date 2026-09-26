import { OG_SIZE, OG_TYPE, ogCard } from "@/lib/og/card";
import { OG } from "@/lib/og/sections";

export const alt = OG.recover.alt;
export const size = OG_SIZE;
export const contentType = OG_TYPE;

export default function Image() {
  return ogCard(OG.recover);
}
