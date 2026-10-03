import { t, msg } from "@/lib/i18n";
import { lp } from "@/lib/i18n";
import type { Metadata } from "next";
import Link from "next/link";
import { PracticeCard } from "@/components/content/Cards";
import { Breadcrumbs } from "@/components/public/Breadcrumbs";
import { JsonLd } from "@/components/public/JsonLd";
import { PublicShell } from "@/components/public/PublicShell";
import { StartCta } from "@/components/public/StartCta";
import { PRACTICE_KINDS } from "@/lib/api/content";
import { serverContent } from "@/lib/content/server";
import { abs, alternates, ORG_ID, WEBSITE_ID, inLanguage } from "@/lib/seo";
import s from "@/components/public/public.module.css";
import { ogMeta } from "@/lib/og/sections";
import { Breathing } from "@/components/illustrations";
import { AvatarDecor } from "@/components/decor/AvatarDecor";

// Data comes from the 5-minute content cache; rendering per request keeps the list fresh after deploys.
export const dynamic = "force-dynamic";

const TITLE = msg("Практики самопомощи: дыхание, заземление, расслабление");
const DESCRIPTION =
  msg("Короткие упражнения, которые помогают справиться с\u00a0тревогой и\u00a0напряжением: дыхание с\u00a0длинным выдохом, заземление 5-4-3-2-1, мышечное расслабление, дневник. С\u00a0объяснением, почему это\u00a0работает, и\u00a0предостережениями.");

export function generateMetadata(): Metadata {
  return {
    title: t(TITLE),
    description: t(DESCRIPTION),
    alternates: alternates("/practices"),
    ...ogMeta("/practices", t("Практики для\u00a0себя"), t(DESCRIPTION)),
  };
}

export default async function PracticesPage() {
  const practices = await serverContent.practices();
  const groups = PRACTICE_KINDS.map((k) => ({ ...k, items: practices.filter((p) => p.kind === k.value) })).filter(
    (g) => g.items.length > 0,
  );
  // a decorative avatar in the empty grid columns of a short group (not the first one: the intro has art)
  const decorAt = groups.findIndex((g, i) => i > 0 && g.items.length === 1);

  return (
    <PublicShell>
      <Breadcrumbs
        items={[
          { name: t("Главная"), href: "/" },
          { name: t("Практики"), href: "/practices" },
        ]}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          "@id": abs("/practices"),
          url: abs("/practices"),
          name: t(TITLE),
          description: t(DESCRIPTION),
          inLanguage: inLanguage(),
          isPartOf: { "@id": WEBSITE_ID },
          publisher: { "@id": ORG_ID },
          mainEntity: {
            "@type": "ItemList",
            itemListElement: practices.map((p, i) => ({ "@type": "ListItem", position: i + 1, url: abs(`/practices/${p.slug}`), name: p.title })),
          },
        }}
      />
      <header className={s.intro}>
        <div>
          <h1>{t("Практики")}</h1>
          <p>{t("Короткие упражнения на\u00a03–10\u00a0минут, чтобы немного успокоиться.")}</p>
        </div>
        <Breathing className={s.introArt} />
      </header>

      {groups.length === 0 ? (
        <p className={s.empty}>
          {t("Практики скоро появятся. А\u00a0пока загляните в")}{" "}<Link href={lp("/articles")}>{t("статьи")}</Link>.
        </p>
      ) : (
        groups.map((g, i) => (
          <section key={g.value} aria-labelledby={`kind-${g.value}`} className={i === decorAt ? s.decorHost : undefined}>
            <div className={s.sectionHead} style={i === 0 ? { marginTop: 0 } : undefined}>
              <h2 id={`kind-${g.value}`}>{g.label}</h2>
            </div>
            <ul className={s.practiceGrid}>
              {g.items.map((p) => (
                <li key={p.id}>
                  <PracticeCard p={p} base="" />
                </li>
              ))}
            </ul>
            {i === decorAt && <AvatarDecor heads={["timur"]} size={170} from={1200} className={s.groupDecor} />}
          </section>
        ))
      )}

      <StartCta title={t("Если практики помогают не\u00a0до\u00a0конца")} />
    </PublicShell>
  );
}
