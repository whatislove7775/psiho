import type { Metadata } from "next";
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

export const DRAFT_UPDATED = "Редакция от [будет заполнено]";
