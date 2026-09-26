import Link from "next/link";
import type { ReactNode } from "react";
import { FileClock } from "lucide-react";
import { LEGAL_DOCS } from "@/components/legal/docs";
import { Breadcrumbs } from "@/components/public/Breadcrumbs";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";
import s from "./landing.module.css";
import l from "./legal.module.css";

export interface LegalSection {
  id: string;
  title: string;
  body: ReactNode;
}

/** Document page: summary card, contents, numbered sections, links to the other documents. */
export function LegalPage({
  title,
  updated,
  summary,
  sections,
  slug,
  draft,
}: {
  title: string;
  updated: string;
  summary: ReactNode;
  sections: LegalSection[];
  /** Registry slug: enables breadcrumbs and «Другие документы». */
  slug?: string;
  /** The document is a structured placeholder until the lawyers finish it. */
  draft?: boolean;
}) {
  const others = slug ? LEGAL_DOCS.filter((d) => d.slug !== slug) : [];
  return (
    <div className={s.page}>
      <SiteHeader />
      <main className={`${s.wrap} ${l.layout}`}>
        <aside className={l.toc} aria-label="Содержание">
          <p className={l.tocTitle}>Содержание</p>
          <ol>
            {sections.map((sec) => (
              <li key={sec.id}>
                <a href={`#${sec.id}`}>{sec.title}</a>
              </li>
            ))}
          </ol>
        </aside>
        <article className={l.doc}>
          {slug && (
            <Breadcrumbs
              items={[
                { name: "Главная", href: "/" },
                { name: "Документы", href: "/legal" },
                { name: title, href: `/legal/${slug}` },
              ]}
            />
          )}
          <header className={l.head}>
            <h1>{title}</h1>
            <p>{updated}</p>
          </header>
          {draft && (
            <p className={l.draftNote} role="note">
              <FileClock size={16} strokeWidth={2} aria-hidden />
              <span>
                Документ готовится вместе с юристом. Разделы, отмеченные «[будет заполнено]», пока пустые: мы не
                придумываем юридические детали и реквизиты. Вопросы можно задать на{" "}
                <a href="mailto:support@aprosop.ru">support@aprosop.ru</a>.
              </span>
            </p>
          )}
          <div className={l.summary}>{summary}</div>
          {sections.map((sec, i) => (
            <section key={sec.id} id={sec.id} className={l.section} aria-labelledby={`${sec.id}-h`}>
              <h2 id={`${sec.id}-h`}>
                <span className={l.num}>{i + 1}</span>
                {sec.title}
              </h2>
              <div className={l.body}>{sec.body}</div>
            </section>
          ))}
          {others.length > 0 && (
            <nav className={l.related} aria-labelledby="other-docs">
              <h2 id="other-docs">Другие документы</h2>
              <ul>
                {others.map((d) => (
                  <li key={d.slug}>
                    <Link href={`/legal/${d.slug}`}>{d.title}</Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
