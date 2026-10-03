import type { Metadata } from "next";
import { msg } from "@/lib/i18n";
import { alternates } from "@/lib/seo";
import { legalDoc } from "./docs";
import { ogMeta } from "@/lib/og/sections";

export function legalMetadata(slug: string): Metadata {
  const d = legalDoc(slug);
  return {
    title: d.title,
    description: d.description,
    alternates: alternates(`/legal/${slug}`),
    ...ogMeta(`/legal/${slug}`, d.title, d.description),
  };
}

/** Source string; LegalPage translates it. */
export const DRAFT_UPDATED = msg("Редакция от\u00a0[будет заполнено]");
