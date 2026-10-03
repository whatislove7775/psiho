import { getLocale, t } from "@/lib/i18n";
import { lp } from "@/lib/i18n";
import { LEGAL_EN } from "@/components/legal/en";
import { TbdBlock } from "@/components/legal/Placeholder";
import Link from "next/link";
import type { ReactNode } from "react";
import { FileClock } from "lucide-react";
import { LEGAL_DOCS, TBD as TBD_MARK } from "@/components/legal/docs";
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
  // Other languages: documents written as module-level Russian JSX have English bodies in components/legal/en.tsx;
  // sections without one are shown as «[to be completed]».
  const foreign = getLocale() !== "ru";
  const enBodies = foreign && slug ? LEGAL_EN[slug] : undefined;
  const bodyOf = (sec: LegalSection) => (enBodies ? enBodies[sec.id] ?? <TbdBlock /> : sec.body);
  return (
    <div className={s.page}>
      <SiteHeader />
      <main className={`${s.wrap} ${l.layout}`}>
        <aside className={l.toc} aria-label={t("Содержание")}>
          <p className={l.tocTitle}>{t("Содержание")}</p>
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
                { name: t("Главная"), href: lp("/") },
                { name: t("Документы"), href: lp("/legal") },
                { name: title, href: lp(`/legal/${slug}`) },
              ]}
            />
          )}
          <header className={l.head}>
            <h1>{title}</h1>
            <p>{t(updated)}</p>
          </header>
          {foreign && (
            <p className={l.draftNote} role="note">
              <FileClock size={16} strokeWidth={2} aria-hidden />
              <span>
                {t("Перевод для удобства. Какая языковая версия имеет силу, определит юрист:")} {t(TBD_MARK)}
              </span>
            </p>
          )}
          {draft && (
            <p className={l.draftNote} role="note">
              <FileClock size={16} strokeWidth={2} aria-hidden />
              <span>{t("Черновик: разделы с\u00a0пометкой «[будет заполнено]» готовятся вместе с\u00a0юристом.")}</span>
            </p>
          )}
          <div className={l.summary}>{summary}</div>
          {sections.map((sec, i) => (
            <section key={sec.id} id={sec.id} className={l.section} aria-labelledby={`${sec.id}-h`}>
              <h2 id={`${sec.id}-h`}>
                <span className={l.num}>{i + 1}</span>
                {sec.title}
              </h2>
              <div className={l.body}>{bodyOf(sec)}</div>
            </section>
          ))}
          {others.length > 0 && (
            <nav className={l.related} aria-labelledby="other-docs">
              <h2 id="other-docs">{t("Другие документы")}</h2>
              <ul>
                {others.map((d) => (
                  <li key={d.slug}>
                    <Link href={lp(`/legal/${d.slug}`)}>{d.title}</Link>
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
