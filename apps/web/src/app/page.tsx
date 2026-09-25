import type { Metadata } from "next";
import { Anonymity } from "@/components/landing/Anonymity";
import { Faq } from "@/components/landing/Faq";
import { Hero } from "@/components/landing/Hero";
import { SessionSteps } from "@/components/landing/SessionSteps";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { SiteHeader } from "@/components/landing/SiteHeader";
import { Specialists } from "@/components/landing/Specialists";
import { Button } from "@/ui";
import { Hello } from "@/components/illustrations";
import a from "@/components/landing/art.module.css";
import s from "@/components/landing/landing.module.css";

export const metadata: Metadata = {
  title: { absolute: "aprosop — анонимный психолог онлайн, вместо лица 3D-аватар" },
  description:
    "Видеосессии с проверенными психологами без почты и телефона. Вместо лица 3D-аватар, который повторяет мимику; видео идёт напрямую и не записывается.",
  alternates: { canonical: "/" },
};

export default function LandingPage() {
  return (
    <div className={s.page}>
      <SiteHeader />
      <main>
        <Hero />
        <Anonymity />
        <SessionSteps />
        <Specialists />
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
    </div>
  );
}
