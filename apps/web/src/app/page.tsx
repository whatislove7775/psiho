import { t } from "@/lib/i18n";
import { lp } from "@/lib/i18n";
import type { Metadata } from "next";
import { Faq } from "@/components/landing/Faq";
import { faqLd } from "@/components/landing/faqLd";
import { FeaturedContent } from "@/components/landing/FeaturedContent";
import { JsonLd } from "@/components/public/JsonLd";
import { alternates } from "@/lib/seo";
import { Hero } from "@/components/landing/Hero";
import { SessionSteps } from "@/components/landing/SessionSteps";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { SiteHeader } from "@/components/landing/SiteHeader";
import { Specialists } from "@/components/landing/Specialists";
import { CirclesTeaser } from "@/components/landing/CirclesTeaser";
import { Button } from "@/ui";
import { MaskFriend } from "@/components/illustrations";
import s from "@/components/landing/landing.module.css";
import { ogMeta } from "@/lib/og/sections";

export function generateMetadata(): Metadata {
  return {
    title: { absolute: t("Aprosop\u00a0— анонимный психолог онлайн, вместо лица 3D-аватар") },
    description:
      t("Диалоги и\u00a0видеосозвоны с\u00a0проверенными психологами без\u00a0почты и\u00a0телефона. Вместо лица 3D-аватар, который повторяет мимику; видео идёт напрямую и\u00a0не\u00a0записывается."),
    alternates: alternates("/"),
    ...ogMeta("/", t("Психолог онлайн, сохраняя лицо и имя в тайне"), t("Без\u00a0почты, телефона и\u00a0лица.")),
  };
}

// Featured articles come from the 5-minute content cache; render per request so a deploy never
// freezes an empty section into the static page.
export const dynamic = "force-dynamic";

export default function LandingPage() {
  return (
    <div className={s.page}>
      <SiteHeader />
      <main>
        <Hero />
        <SessionSteps />
        <Specialists />
        <CirclesTeaser />
        <FeaturedContent />
        <Faq />
        <section className={`${s.wrap} ${s.closing}`} aria-labelledby="closing-title">
          <div className={s.plaque}>
            <div className={s.closingText}>
              <h2 id="closing-title">{t("Начать можно за\u00a0минуту")}</h2>
              <p>{t("Нужен только пароль.")}</p>
            </div>
            <div className={s.closingActions}>
              <Button href={lp("/start")} variant="primary" size="md">
                {t("Начать анонимно")}
              </Button>
            </div>
            <MaskFriend className={s.closingArt} />
          </div>
        </section>
      </main>
      <SiteFooter />
      <JsonLd data={faqLd()} />
    </div>
  );
}
