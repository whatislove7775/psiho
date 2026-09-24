import type { ReactNode } from "react";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";
import s from "./landing.module.css";
import l from "./legal.module.css";

export interface LegalSection {
  id: string;
  title: string;
  body: ReactNode;
}

/** Plain-language document page: summary card, contents, numbered sections. */
export function LegalPage({
  title,
  updated,
  summary,
  sections,
}: {
  title: string;
  updated: string;
  summary: ReactNode;
  sections: LegalSection[];
}) {
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
          <header className={l.head}>
            <h1>{title}</h1>
            <p>Обновлено {updated}</p>
          </header>
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
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
