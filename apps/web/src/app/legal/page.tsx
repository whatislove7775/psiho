import Link from "next/link";
import { FileText } from "lucide-react";
import { LEGAL_DOCS } from "@/components/legal/docs";
import { Breadcrumbs } from "@/components/public/Breadcrumbs";
import { PublicShell } from "@/components/public/PublicShell";
import { alternates } from "@/lib/seo";
import s from "@/components/public/public.module.css";

export const metadata = {
  title: "Документы",
  description: "Правовые документы сервиса aprosop: политика конфиденциальности, соглашение, оферта, правила возврата и другие.",
  alternates: alternates("/legal"),
};

const GROUPS = [
  { title: "Для всех", audience: "all" },
  { title: "Для клиентов", audience: "clients" },
  { title: "Для специалистов", audience: "specialists" },
] as const;

export default function LegalIndexPage() {
  return (
    <PublicShell>
      <Breadcrumbs
        items={[
          { name: "Главная", href: "/" },
          { name: "Документы", href: "/legal" },
        ]}
      />
      <header className={s.intro}>
        <div>
          <h1>Документы</h1>
          <p>Правила сервиса и то, как мы обращаемся с данными. Часть документов ещё готовится вместе с юристом.</p>
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
