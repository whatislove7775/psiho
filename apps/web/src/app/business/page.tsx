import { t } from "@/lib/i18n";
import type { Metadata } from "next";
import { BarChart3, Check, EyeOff, FileText, Lock, UserX, X } from "lucide-react";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { SiteHeader } from "@/components/landing/SiteHeader";
import { JsonLd } from "@/components/public/JsonLd";
import { BizFaq } from "@/components/business/landing/BizFaq";
import { LeadForm } from "@/components/business/landing/LeadForm";
import { bizFaqLd } from "@/components/business/landing/content";
import { Button } from "@/ui";
import { HeartHands, PaperPlane } from "@/components/illustrations";
import { AvatarDecor } from "@/components/decor/AvatarDecor";
import { abs, alternates, ORG_ID } from "@/lib/seo";
import { ogMeta } from "@/lib/og/sections";
import l from "@/components/landing/landing.module.css";
import s from "@/components/business/landing/biz.module.css";

const TITLE = "Психолог для\u00a0сотрудников\u00a0— анонимно";
const DESCRIPTION =
  "Корпоративная программа психологической помощи: сотрудники получают анонимные созвоны с\u00a0проверенными психологами, компания оплачивает их\u00a0из\u00a0предоплаченного бюджета и\u00a0видит только общие цифры.";

export function generateMetadata(): Metadata {
  return {
    title: t("Для\u00a0компаний: психологическая помощь сотрудникам"),
    description: DESCRIPTION,
    alternates: alternates("/business"),
    ...ogMeta("/business", TITLE, t("Сотрудники анонимны, компания видит только общие цифры и\u00a0платит по\u00a0счёту.")),
  };
}

const serviceLd = {
  "@context": "https://schema.org",
  "@type": "Service",
  get name() { return t("Aprosop для\u00a0компаний"); },
  get serviceType() { return t("Корпоративная программа психологической поддержки сотрудников"); },
  description: DESCRIPTION,
  url: abs("/business"),
  provider: { "@id": ORG_ID },
  areaServed: "RU",
  audience: { "@type": "BusinessAudience", get name() { return t("Компании и\u00a0HR-отделы"); } },
};

const SEES = [
  "Бюджет, пополнения и\u00a0списания по\u00a0месяцам",
  "Сколько кодов выпущено",
  "Сколько людей и\u00a0созвонов за\u00a0месяц\u00a0— если их\u00a05\u00a0и\u00a0больше",
  "Доли тем обращений и\u00a0средняя оценка\u00a0— тоже от\u00a05\u00a0человек",
  "Счета и\u00a0акты с\u00a0суммой за\u00a0месяц",
];
const NEVER = [
  "Кто активировал код и\u00a0кто обращался",
  "Псевдонимы, аватары, переписку, записи созвонов",
  "Имена специалистов у\u00a0конкретных сотрудников",
  "Даты и\u00a0время созвонов\u00a0— только месяц целиком",
  "Любые цифры, если за\u00a0месяц было меньше 5\u00a0человек",
];

export default function BusinessLanding() {
  return (
    <div className={l.page}>
      <SiteHeader />
      <main>
        {/* 1. Hero */}
        <section className={`${l.wrap} ${s.hero}`} aria-labelledby="biz-title">
          <div className={s.heroText}>
            <p className={l.kicker}>{t("Для\u00a0компаний")}</p>
            <h1 id="biz-title" className={s.title}>
              {t("Психолог для\u00a0ваших сотрудников.")}{" "}<span className={s.titleAccent}>{t("Полностью анонимно.")}</span>
            </h1>
            <p className={l.lead}>
              {t("Сотрудник получает код и\u00a0общается с\u00a0проверенным психологом из\u00a0анонимного аккаунта\u00a0— без\u00a0почты, телефона и\u00a0лица на\u00a0камере. Компания оплачивает созвоны из\u00a0предоплаченного бюджета и\u00a0видит только общие цифры.")}
            </p>
            <div className={s.heroActions}>
              <Button href="#calc" variant="primary" size="lg">
                {t("Рассчитать для\u00a0компании")}
              </Button>
              <Button href="#how" variant="soft" size="lg">
                {t("Как\u00a0это\u00a0работает")}
              </Button>
            </div>
            <ul className={s.heroPoints}>
              <li>
                <Lock size={16} aria-hidden />{" "}{t("Работодатель не\u00a0узнаёт, кто обратился")}
              </li>
              <li>
                <FileText size={16} aria-hidden />{" "}{t("Счёт, договор и\u00a0акты")}
              </li>
            </ul>
          </div>

          <div className={s.heroVisual} aria-hidden>
            <div className={s.mock}>
              <div className={s.mockHead}>
                <span className={s.mockDot} />
                {t("Кабинет компании")}
              </div>
              <div className={s.mockGrid}>
                <div className={s.mockKpi}>
                  <span>{t("Созвонов в\u00a0сентябре")}</span>
                  <strong>38</strong>
                </div>
                <div className={s.mockKpi}>
                  <span>{t("Сотрудников")}</span>
                  <strong>17</strong>
                </div>
              </div>
              <div className={s.mockRow}>
                <span>{t("Август")}</span>
                <span className={s.mockHidden}>{t("менее 5")}</span>
              </div>
              <div className={s.mockRow}>
                <span>{t("Кто обращался")}</span>
                <span className={s.mockLock}>
                  <EyeOff size={14} />{" "}{t("не\u00a0показываем")}
                </span>
              </div>
              <div className={s.mockBars}>
                <span style={{ width: "46%" }} />
                <span style={{ width: "31%" }} />
                <span style={{ width: "23%" }} />
              </div>
              <div className={s.mockNote}>{t("Пример интерфейса, цифры условные")}</div>
            </div>
          </div>
        </section>

        {/* 2. Anonymity guarantee */}
        <section id="privacy" className={`${l.wrap} ${l.section}`} aria-labelledby="biz-privacy">
          <div className={s.sectionHead}>
            <h2 id="biz-privacy" className={l.sectionTitle}>
              {t("Анонимность\u00a0— это\u00a0продукт, а\u00a0не\u00a0пункт в\u00a0договоре")}
            </h2>
            <p className={l.lead}>
              {t("Люди не\u00a0пойдут к\u00a0психологу, если руководитель может об\u00a0этом узнать. Поэтому связь «сотрудник\u00a0— аккаунт» не\u00a0видна компании технически: в\u00a0нашей базе код не\u00a0хранит, кто его активировал.")}
            </p>
          </div>
          <div className={s.compare}>
            <div className={`${s.compareCol} ${s.compareSees}`}>
              <h3>
                <BarChart3 size={20} aria-hidden />{" "}{t("Что\u00a0видит компания")}
              </h3>
              <ul>
                {SEES.map((x) => (
                  <li key={x}>
                    <Check size={18} aria-hidden /> {x}
                  </li>
                ))}
              </ul>
            </div>
            <div className={`${s.compareCol} ${s.compareNever}`}>
              <h3>
                <UserX size={20} aria-hidden />{" "}{t("Чего не\u00a0видит никто в\u00a0компании")}
              </h3>
              <ul>
                {NEVER.map((x) => (
                  <li key={x}>
                    <X size={18} aria-hidden /> {x}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* 3. Why */}
        <section className={`${l.wrap} ${l.section}`} aria-labelledby="biz-why">
          <div className={`${s.sectionHead} ${s.decorHost}`}>
            <h2 id="biz-why" className={l.sectionTitle}>
              {t("Зачем это\u00a0компании")}
            </h2>
            <p className={l.lead}>
              {t("Мы\u00a0не\u00a0обещаем волшебных процентов. Считайте эффект на\u00a0своих метриках\u00a0— текучесть, больничные, вовлечённость\u00a0— до\u00a0и\u00a0после пилота.")}
            </p>
            <AvatarDecor heads={["lev", "sonya"]} size={200} from={1200} className={s.whyDecor} />
          </div>
          <div className={s.cards}>
            <div className={s.card}>
              <h3>{t("Помощь до\u00a0выгорания")}</h3>
              <p>{t("Когда не\u00a0нужно объяснять руководителю и\u00a0платить из\u00a0своего кармана, к\u00a0специалисту обращаются раньше, а\u00a0не\u00a0в\u00a0кризисе.")}</p>
            </div>
            <div className={s.card}>
              <h3>{t("Без\u00a0стигмы")}</h3>
              <p>{t("Ни\u00a0почты, ни\u00a0телефона, ни\u00a0лица на\u00a0камере: вместо него 3D-аватар. Сотрудник уверен, что\u00a0об\u00a0обращении не\u00a0узнают.")}</p>
            </div>
            <div className={s.card}>
              <h3>{t("Предсказуемый бюджет")}</h3>
              <p>{t("Лимит на\u00a0человека за\u00a0месяц, квартал или\u00a0год. Списываются только состоявшиеся созвоны, отмены возвращаются.")}</p>
            </div>
          </div>
        </section>

        {/* 4. How it works */}
        <section id="how" className={`${l.wrap} ${l.section}`} aria-labelledby="biz-how">
          <div className={s.sectionHead}>
            <h2 id="biz-how" className={l.sectionTitle}>
              {t("Как\u00a0это\u00a0работает")}
            </h2>
          </div>
          <ol className={l.steps}>
            <li className={l.step}>
              <span className={l.stepNum} aria-hidden>1</span>
              <h3>{t("Компания пополняет бюджет")}</h3>
              <p>{t("Подписываем договор, выставляем счёт. Вы\u00a0задаёте лимит на\u00a0сотрудника и\u00a0что\u00a0оплачивает программа.")}</p>
            </li>
            <li className={l.step}>
              <span className={l.stepNum} aria-hidden>2</span>
              <h3>{t("HR раздаёт одноразовые коды")}</h3>
              <p>{t("Выпускаете коды в\u00a0кабинете и\u00a0выгружаете в\u00a0CSV. Раздаёте как\u00a0удобно: в\u00a0письме, в\u00a0чате, на\u00a0бумаге.")}</p>
            </li>
            <li className={l.step}>
              <span className={l.stepNum} aria-hidden>3</span>
              <h3>{t("Сотрудник записывается анонимно")}</h3>
              <p>{t("Вводит код в\u00a0анонимном аккаунте, выбирает психолога\u00a0— созвоны оплачиваются из\u00a0программы, дальше при\u00a0желании сам.")}</p>
            </li>
          </ol>
        </section>

        {/* 5. Pricing / lead form */}
        <section id="calc" className={`${l.wrap} ${l.section}`} aria-labelledby="biz-calc">
          <div className={s.calc}>
            <div className={s.calcIntro}>
              <h2 id="biz-calc" className={l.sectionTitle}>
                {t("Рассчитать стоимость")}
              </h2>
              <p className={l.lead}>
                {t("Цена зависит от\u00a0числа сотрудников и\u00a0лимита на\u00a0человека. Можно начать с\u00a0пилота на\u00a0один отдел. Оставьте контакты\u00a0— пришлём расчёт и\u00a0договор.")}
              </p>
              <ul className={s.calcList}>
                <li>
                  <Check size={18} aria-hidden />{" "}{t("Предоплаченный бюджет, без\u00a0абонентской платы за\u00a0«мёртвые души»")}
                </li>
                <li>
                  <Check size={18} aria-hidden />{" "}{t("Лимит в\u00a0рублях, в\u00a0созвонах или\u00a0и\u00a0то\u00a0и\u00a0другое")}
                </li>
                <li>
                  <Check size={18} aria-hidden />{" "}{t("Счета и\u00a0ежемесячные акты для\u00a0бухгалтерии")}
                </li>
              </ul>
              <PaperPlane className={s.calcArt} />
            </div>
            <div className={s.calcForm}>
              <LeadForm />
            </div>
          </div>
        </section>

        {/* 6. FAQ */}
        <section id="faq" className={`${l.wrap} ${l.section}`} aria-labelledby="biz-faq">
          <div className={l.faq}>
            <div className={l.faqIntro}>
              <h2 id="biz-faq" className={l.sectionTitle}>
                {t("Вопросы HR и\u00a0руководителей")}
              </h2>
              <p className={l.lead}>
                {t("Не\u00a0нашли ответ? Напишите на")}{" "}<a href="mailto:b2b@aprosop.ru">b2b@aprosop.ru</a>.
              </p>
              <AvatarDecor heads={["vera"]} size={180} from={1200} className={l.faqDecor} />
            </div>
            <BizFaq />
          </div>
        </section>

        {/* 7. CTA */}
        <section className={`${l.wrap} ${l.closing}`} aria-labelledby="biz-closing">
          <div className={l.plaque}>
            <div className={l.closingText}>
              <h2 id="biz-closing">{t("Забота, о\u00a0которой не\u00a0нужно докладывать")}</h2>
              <p>{t("Запустим пилот за\u00a0неделю: договор, счёт, коды для\u00a0первого отдела.")}</p>
            </div>
            <div className={l.closingActions}>
              <Button href="#calc" variant="primary" size="md">
                {t("Рассчитать для\u00a0компании")}
              </Button>
              <Button href="/login" variant="ghost" size="md">
                {t("Вход для\u00a0HR")}
              </Button>
            </div>
            <HeartHands className={l.closingArt} />
          </div>
        </section>
      </main>
      <SiteFooter />
      <JsonLd data={serviceLd} />
      <JsonLd data={bizFaqLd()} />
    </div>
  );
}
