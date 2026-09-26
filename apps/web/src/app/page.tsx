import type { Metadata } from "next";
import { Anonymity } from "@/components/landing/Anonymity";
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
import { Hello } from "@/components/illustrations";
import a from "@/components/landing/art.module.css";
import s from "@/components/landing/landing.module.css";
import { ogMeta } from "@/lib/og/sections";

export const metadata: Metadata = {
  title: { absolute: "aprosop — анонимный психолог онлайн, вместо лица 3D-аватар" },
  description:
    "Диалоги и видеосозвоны с проверенными психологами без почты и телефона. Вместо лица 3D-аватар, который повторяет мимику; видео идёт напрямую и не записывается.",
  alternates: alternates("/"),
  ...ogMeta("/", "Анонимный психолог онлайн", "Без почты и телефона. Вместо лица — 3D-аватар, видео не записывается."),
};

// Featured articles come from the 5-minute content cache; render per request so a deploy never
// freezes an empty section into the static page.
export const dynamic = "force-dynamic";

export default function LandingPage() {
  return (
    <div className={s.page}>
      <SiteHeader />
      <main>
        <Hero />
        <Anonymity />
        <SessionSteps />
        <Specialists />
        <CirclesTeaser />
        <FeaturedContent />
        <Faq />
        <section className={`${s.wrap} ${s.section}`} aria-labelledby="closing-title">
          <div className={s.closing}>
            <div className={a.closingMain}>
              <Hello className={a.closingArt} />
              <div>
                <h2 id="closing-title">Начать можно за минуту</h2>
                <p>Понадобится только пароль. Аватар соберёте следом, специалиста выберете, когда будете готовы.</p>
              </div>
            </div>
            <div className={s.closingActions}>
              <Button href="/start" variant="primary" size="lg">
                Начать анонимно
              </Button>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
      <JsonLd data={faqLd} />
    </div>
  );
}
