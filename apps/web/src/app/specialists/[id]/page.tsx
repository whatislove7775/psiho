import { SpecialistProfile } from "@/components/specialists/SpecialistProfile";
import { SiteHeader } from "@/components/landing/SiteHeader";
import { SiteFooter } from "@/components/landing/SiteFooter";
import s from "@/components/landing/landing.module.css";
export default function Page() {
  return (
    <div className={s.page}>
      <SiteHeader />
      <main className={`${s.wrap} ${s.section}`}>
        <SpecialistProfile publicMode />
      </main>
      <SiteFooter />
    </div>
  );
}
