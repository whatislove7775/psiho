import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ArticleCard, PracticeCard } from "@/components/content/Cards";
import { serverContent } from "@/lib/content/server";
import s from "./featured.module.css";
import l from "./landing.module.css";

/** Landing section with public articles and practices (server-rendered for search engines). */
export async function FeaturedContent() {
  const [articles, practices] = await Promise.all([serverContent.articles({ limit: 3 }), serverContent.practices()]);
  if (!articles.length && !practices.length) return null;
  return (
    <section id="useful" className={`${l.wrap} ${l.section}`} aria-labelledby="useful-title">
      <div className={s.head}>
        <div>
          <h2 id="useful-title" className={l.sectionTitle}>
            Полезное
          </h2>
          <p className={l.lead}>
            Статьи о тревоге, выгорании, сне и отношениях — с проверенными источниками. И короткие практики, когда нужно
            успокоиться прямо сейчас. Читать можно без регистрации.
          </p>
        </div>
        <Link href="/articles" className={s.more}>
          Все статьи
          <ArrowRight size={16} strokeWidth={2} aria-hidden />
        </Link>
      </div>
      <div className={s.layout}>
        <ul className={s.articles}>
          {articles.map((a) => (
            <li key={a.id}>
              <ArticleCard a={a} base="" />
            </li>
          ))}
        </ul>
        {practices.length > 0 && (
          <div className={s.practices}>
            <h3 className={s.subTitle}>Практики на 3–10 минут</h3>
            <ul>
              {practices.slice(0, 3).map((p) => (
                <li key={p.id}>
                  <PracticeCard p={p} base="" />
                </li>
              ))}
            </ul>
            <Link href="/practices" className={s.moreSmall}>
              Все практики
              <ArrowRight size={14} strokeWidth={2} aria-hidden />
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
