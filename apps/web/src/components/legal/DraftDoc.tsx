import type { ReactNode } from "react";
import { LegalPage, type LegalSection } from "@/components/landing/LegalPage";
import { legalDoc } from "./docs";
import { DRAFT_UPDATED } from "./meta";
import { TbdBlock } from "./Placeholder";

export interface DraftSection {
  id: string;
  title: string;
  /** Known, true facts about the service; the rest stays a placeholder. */
  body?: ReactNode;
  /** What the lawyers still have to write in this clause. */
  todo?: string;
}

/** A legal document that exists as a clear structure with marked gaps. */
export function DraftDoc({ slug, summary, sections }: { slug: string; summary: ReactNode; sections: DraftSection[] }) {
  const d = legalDoc(slug);
  const list: LegalSection[] = sections.map((sec) => ({
    id: sec.id,
    title: sec.title,
    body: (
      <>
        {sec.body}
        {(sec.todo !== undefined || !sec.body) && <TbdBlock>{sec.todo}</TbdBlock>}
      </>
    ),
  }));
  return <LegalPage slug={slug} draft title={d.title} updated={DRAFT_UPDATED} summary={summary} sections={list} />;
}
