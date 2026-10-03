import type { Metadata } from "next";
import { t } from "@/lib/i18n";
import Link from "next/link";
import { FileText } from "lucide-react";
import { LEGAL_DOCS } from "@/components/legal/docs";
import { Breadcrumbs } from "@/components/public/Breadcrumbs";
import { PublicShell } from "@/components/public/PublicShell";
import { alternates } from "@/lib/seo";
import s from "@/components/public/public.module.css";

export function generateMetadata(): Metadata {
  return {
    title: t("Документы"),
    description: t("Правовые документы сервиса Aprosop: политика конфиденциальности, соглашение, оферта, правила возврата и\u00a0другие."),
    alternates: alternates("/legal"),
  };
}

const GROUPS = [
  { get title() { return t("Для\u00a0всех"); }, audience: "all" },
  { get title() { return t("Для\u00a0клиентов"); }, audience: "clients" },
  { get title() { return t("Для\u00a0специалистов"); }, audience: "specialists" },
] as const;

export default function LegalIndexPage() {
  return (
    <PublicShell>
      <Breadcrumbs
        items={[
          { name: t("Главная"), href: "/" },
          { name: t("Документы"), href: "/legal" },
        ]}
      />
      <header className={s.intro}>
        <div>
          <h1>{t("Документы")}</h1>
          <p>{t("Правила сервиса и\u00a0то, как\u00a0мы\u00a0обращаемся с\u00a0данными. Часть документов ещё готовится вместе с\u00a0юристом.")}</p>
        </div>
      </header>
      {GROUPS.map((g) => (
        <section key={g.audience} aria-labelledby={`g-${g.audience}`}>
          <div className={s.sectionHead} style={g.audience === "all" ? { marginTop: 0 } : undefined}>
            <h2 id={`g-${g.audience}`}>{g.title}</h2>
          </div>
          <ul className={s.practiceGrid}>
            {LEGAL_DOCS.filter((d) => d.audience === g.audience).map((d) => (
              <li key={d.slug}>
                <Link href={`/legal/${d.slug}`} className={s.docLink}>
                  <FileText size={20} strokeWidth={1.8} aria-hidden />
                  <span>
                    <strong>{d.title}</strong>
                    <span>{d.description}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </PublicShell>
  );
}
