import { t, lp } from "@/lib/i18n";
import { SiteHeader } from "@/components/landing/SiteHeader";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { CoupleScene } from "@/components/couples/CoupleScene";
import { CoupleSpecialists } from "@/components/couples/CoupleSpecialists";
import { Button } from "@/ui";
import l from "@/components/landing/landing.module.css";
import s from "@/components/couples/couples.module.css";
export function generateMetadata() {
  return {
    title: t("Консультации для пары"),
    description: t(
      "Два партнёра и психолог в закрытой встрече. Отдельные аккаунты, аватары и одна цена за двоих.",
    ),
  };
}
export default function Page() {
  return (
    <div className={l.page}>
      <SiteHeader />
      <main className={`${l.wrap} ${l.section} ${s.page}`}>
        <section className={s.coupleHero} aria-labelledby="couple-title">
          <div className={s.heroCopy}>
            <p className={s.eyebrow}>{t("Для партнёров и семейных пар")}</p>
            <h1 id="couple-title">{t("Чтобы услышать друг друга")}</h1>
            <p>
              {t(
                "Начните разговор вдвоём — с психологом, который поможет его построить. У каждого свой аккаунт, свой аватар и пространство для личного.",
              )}
            </p>
            <Button variant="primary" href="#couple-specialists">
              {t("Выбрать психолога для пары")}
            </Button>
            <p className={s.note}>
              {t("Одна цена за двоих. Можно подключиться с разных устройств.")}
            </p>
          </div>
          <CoupleScene />
        </section>
        <section className={s.how}>
          <h2>{t("Как проходит встреча для пары")}</h2>
          <ol className={s.steps}>
            <li>
              <span className={s.stepNumber} aria-hidden>
                01
              </span>
              <h3>{t("Выберите психолога")}</h3>
              <p>
                {t(
                  "Посмотрите профиль, подход и цену. Выберите удобное время для вас обоих.",
                )}
              </p>
            </li>
            <li>
              <span className={s.stepNumber} aria-hidden>
                02
              </span>
              <h3>{t("Пригласите партнёра")}</h3>
              <p>
                {t(
                  "Один оплачивает встречу, второй принимает личное приглашение со своего аккаунта.",
                )}
              </p>
            </li>
            <li>
              <span className={s.stepNumber} aria-hidden>
                03
              </span>
              <h3>{t("Встретьтесь втроём")}</h3>
              <p>
                {t(
                  "Вы, партнёр и психолог — в общей комнате. Личные диалоги остаются отдельными.",
                )}
              </p>
            </li>
          </ol>
          <p className={s.note}>
            {t(
              "Личные диалоги партнёров не объединяются. Мы не записываем созвоны. Если вы вместе в одной комнате, используйте наушники или одно устройство для звука, чтобы избежать эха.",
            )}
          </p>
        </section>
        <section id="couple-specialists" className={s.specialistsSection}>
          <CoupleSpecialists />
        </section>
        <aside className={s.consent}>
          <span className={s.consentMark} aria-hidden>
            ♡
          </span>
          <div>
            <h2>{t("Вместе — по собственному желанию")}</h2>
            <p>
              {t(
                "Если рядом с партнёром страшно или трудно отказаться, начните с личной встречи. Приглашение не обязывает участвовать.",
              )}
            </p>
            <a href={lp("/specialists")}>
              {t("Выбрать индивидуальную консультацию")}
            </a>
          </div>
        </aside>
      </main>
      <SiteFooter />
    </div>
  );
}
