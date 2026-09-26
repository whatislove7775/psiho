import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Clock } from "lucide-react";
import { PracticeCard } from "@/components/content/Cards";
import { Cautions, EvidenceBadge, Mechanism, Sources } from "@/components/content/Evidence";
import { BreathingCircle, StepPlayer } from "@/components/content/PracticePlayer";
import { TopicArt } from "@/components/illustrations/topics";
import { Breadcrumbs } from "@/components/public/Breadcrumbs";
import { JsonLd } from "@/components/public/JsonLd";
import { PublicShell } from "@/components/public/PublicShell";
import { StartCta } from "@/components/public/StartCta";
import type { Practice } from "@/lib/api/content";
import { isSlug, serverContent } from "@/lib/content/server";
import { abs, alternates, ORG_ID, WEBSITE_ID } from "@/lib/seo";
import art from "@/components/content/art.module.css";
import c from "@/components/content/content.module.css";
import s from "@/components/public/public.module.css";

export const revalidate = 300;
export const dynamicParams = true;

type Props = { params: { slug: string } };

async function load(slug: string): Promise<Practice | null> {
  return isSlug(slug) ? serverContent.practice(slug) : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await load(params.slug);
  if (!p) return { title: "Практика не найдена", robots: { index: false } };
  const path = `/practices/${p.slug}`;
  return {
    title: `${p.title}: практика на ${p.duration_minutes} мин`,
    description: p.summary,
    alternates: alternates(path),
    openGraph: { type: "article", url: path, title: p.title, description: p.summary },
  };
}

function patternText(p: Practice): string | null {
  const b = p.pattern;
  if (!b) return null;
  const parts = [`вдох ${b.inhale} с`];
  if (b.hold) parts.push(`пауза ${b.hold} с`);
  parts.push(`выдох ${b.exhale} с`);
  if (b.hold_after) parts.push(`пауза ${b.hold_after} с`);
  return `Ритм: ${parts.join(", ")}; ${b.cycles} циклов.`;
}

export default async function PracticePage({ params }: Props) {
  const p = await load(params.slug);
  if (!p) notFound();

  const all = await serverContent.practices();
  const others = all.filter((o) => o.slug !== p.slug).slice(0, 4);
  const path = `/practices/${p.slug}`;
  const rhythm = patternText(p);

  const howTo = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    "@id": `${abs(path)}#howto`,
    name: p.title,
    description: p.summary,
    inLanguage: "ru-RU",
    url: abs(path),
    totalTime: `PT${p.duration_minutes}M`,
    publisher: { "@id": ORG_ID },
    isPartOf: { "@id": WEBSITE_ID },
    step: p.steps.map((st, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: st.title || `Шаг ${i + 1}`,
      text: st.text,
      url: `${abs(path)}#step-${i + 1}`,
      ...(st.seconds ? { timeRequired: `PT${st.seconds}S` } : {}),
    })),
    ...(p.sources?.length
      ? { citation: p.sources.map((src) => ({ "@type": "CreativeWork", name: src.title, url: src.url })) }
      : {}),
  };

  return (
    <PublicShell>
      <Breadcrumbs
        items={[
          { name: "Главная", href: "/" },
          { name: "Практики", href: "/practices" },
          { name: p.title, href: path },
        ]}
      />
      <JsonLd data={howTo} />

      <div className={s.detail}>
        <article className={s.doc}>
          <header className={s.head}>
            <div className={s.meta}>
              <span
                className={c.tone}
                data-tone={p.cover}
                style={{ width: 36, height: 36, borderRadius: "50%", display: "grid", placeItems: "center" }}
                aria-hidden
              >
                <TopicArt topic={p.kind} className={art.kickerArt} />
              </span>
              <span>{p.kind_label}</span>
              <span>
                <Clock size={14} strokeWidth={1.8} aria-hidden />
                {p.duration_minutes} мин
              </span>
              <EvidenceBadge level={p.evidence_level} />
            </div>
            <h1 className={s.title}>{p.title}</h1>
            {p.summary && <p className={s.lead}>{p.summary}</p>}
          </header>

          <div className={s.player}>
            {p.pattern ? <BreathingCircle pattern={p.pattern} tone={p.cover} /> : <StepPlayer practice={p} />}
          </div>

          {p.steps.length > 0 && (
            <section className={s.steps} aria-labelledby="steps-title">
              <h2 id="steps-title">Как выполнять</h2>
              {rhythm && <p className={s.disclaimer} style={{ marginTop: 0, marginBottom: 12 }}>{rhythm}</p>}
              <ol>
                {p.steps.map((st, i) => (
                  <li key={i} id={`step-${i + 1}`}>
                    <strong>{st.title}</strong>
                    <span>{st.text}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <Mechanism text={p.mechanism} />
          <Cautions text={p.cautions} />
          <Sources sources={p.sources} level={p.evidence_level} reviewedAt={p.reviewed_at} />
        </article>

        <aside className={s.aside} aria-label="Другие практики">
          <StartCta compact />
          {others.length > 0 && (
            <section>
              <h2 className={s.asideTitle}>Другие практики</h2>
              <ul className={s.asideList}>
                {others.map((o) => (
                  <li key={o.id}>
                    <PracticeCard p={o} base="" />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </PublicShell>
  );
}
