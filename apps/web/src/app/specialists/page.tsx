import { SiteHeader } from "@/components/landing/SiteHeader";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { Specialists } from "@/components/landing/Specialists";
import { t } from "@/lib/i18n";
import s from "@/components/landing/landing.module.css";
export function generateMetadata() {
  return {
    title: t("Специалисты"),
    description: t(
      "Выберите психолога до регистрации: образование, подход, стоимость и свободное время.",
    ),
  };
}
export default function Page() {
  return (
    <div className={s.page}>
      <SiteHeader />
      <main>
        <Specialists all />
      </main>
      <SiteFooter />
    </div>
  );
}
