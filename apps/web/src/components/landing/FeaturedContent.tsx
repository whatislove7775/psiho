import { t } from "@/lib/i18n";
import { lp } from "@/lib/i18n";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ArticleCard, PracticeCard } from "@/components/content/Cards";
import { serverContent } from "@/lib/content/server";
import { ScrollRow } from "@/ui";
import s from "./featured.module.css";
import l from "./landing.module.css";

/** «Полезное»: one row — three articles and a practices card of the same height (server-rendered for search engines). */
export async function FeaturedContent() {
  const [articles, practices] = await Promise.all([serverContent.articles({ limit: 3 }), serverContent.practices()]);
  if (!articles.length && !practices.length) return null;
  return (
    <section id="useful" className={`${l.wrap} ${l.section}`} aria-labelledby="useful-title">
      <div className={l.sectionHead}>
        <div>
          <h2 id="useful-title" className={l.sectionTitle}>
            {t("Полезное")}
          </h2>
          <p className={l.sectionSub}>{t("Статьи с\u00a0источниками и\u00a0короткие практики. Без\u00a0регистрации.")}</p>
        </div>
        <Link href={lp("/articles")} className={l.more}>
          {t("Все статьи")}
          <ArrowRight size={16} strokeWidth={2} aria-hidden />
        </Link>
      </div>
      <ScrollRow className={s.bleed} trackClassName={s.row} label={t("Статьи и\u00a0практики")}>
        {articles.map((a) => (
          <div key={a.id} role="listitem" className={s.item}>
            <ArticleCard a={a} base="" />
          </div>
        ))}
        {practices.length > 0 && (
          <div role="listitem" className={`${s.item} ${s.practices}`}>
            <h3 className={s.subTitle}>{t("Практики на\u00a03–10\u00a0минут")}</h3>
            <ul>
              {practices.slice(0, 3).map((p) => (
                <li key={p.id}>
                  <PracticeCard p={p} base="" />
                </li>
              ))}
            </ul>
            <Link href={lp("/practices")} className={s.moreSmall}>
              {t("Все практики")}
              <ArrowRight size={14} strokeWidth={2} aria-hidden />
            </Link>
          </div>
        )}
      </ScrollRow>
    </section>
  );
}
