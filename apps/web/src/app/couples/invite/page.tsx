import { CoupleInvite } from "@/components/couples/CoupleInvite";
import { SiteHeader } from "@/components/landing/SiteHeader";
import { SiteFooter } from "@/components/landing/SiteFooter";
import s from "@/components/landing/landing.module.css";
export const metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default function Page() {
  return (
    <div className={s.page}>
      <SiteHeader />
      <main className={`${s.wrap} ${s.section}`}>
        <CoupleInvite />
      </main>
      <SiteFooter />
    </div>
  );
}
