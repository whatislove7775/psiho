import type { Metadata } from "next";
import {
  BarChart3,
  Building2,
  CalendarCheck2,
  Check,
  EyeOff,
  FileText,
  HeartHandshake,
  KeyRound,
  Lock,
  Scale,
  ShieldCheck,
  UserX,
  Wallet,
  X,
} from "lucide-react";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { SiteHeader } from "@/components/landing/SiteHeader";
import { JsonLd } from "@/components/public/JsonLd";
import { ShieldFriend, Together } from "@/components/illustrations";
import { BizFaq } from "@/components/business/landing/BizFaq";
import { LeadForm } from "@/components/business/landing/LeadForm";
import { bizFaqLd } from "@/components/business/landing/content";
import { Button } from "@/ui";
import { abs, alternates, ORG_ID } from "@/lib/seo";
import { ogMeta } from "@/lib/og/sections";
import l from "@/components/landing/landing.module.css";
import s from "@/components/business/landing/biz.module.css";

const TITLE = "Психолог для сотрудников — анонимно";
const DESCRIPTION =
  "Корпоративная программа психологической помощи: сотрудники получают анонимные созвоны с проверенными психологами, компания оплачивает их из предоплаченного бюджета и видит только общие цифры.";

export const metadata: Metadata = {
  title: "Для компаний: психологическая помощь сотрудникам",
  description: DESCRIPTION,
  alternates: alternates("/business"),
  ...ogMeta("/business", TITLE, "Сотрудники анонимны, компания видит только общие цифры и платит по счёту."),
};

const serviceLd = {
  "@context": "https://schema.org",
  "@type": "Service",
  name: "aprosop для компаний",
  serviceType: "Корпоративная программа психологической поддержки сотрудников",
  description: DESCRIPTION,
  url: abs("/business"),
  provider: { "@id": ORG_ID },
  areaServed: "RU",
  audience: { "@type": "BusinessAudience", name: "Компании и HR-отделы" },
};

const SEES = [
  "Бюджет, пополнения и списания по месяцам",
  "Сколько кодов выпущено",
  "Сколько людей и созвонов за месяц — если их 5 и больше",
  "Доли тем обращений и средняя оценка — тоже от 5 человек",
  "Счета и акты с суммой за месяц",
];
const NEVER = [
  "Кто активировал код и кто обращался",
  "Псевдонимы, аватары, переписку, записи созвонов",
  "Имена специалистов у конкретных сотрудников",
  "Даты и время созвонов — только месяц целиком",
  "Любые цифры, если за месяц было меньше 5 человек",
];

export default function BusinessLanding() {
  return (
    <div className={l.page}>
      <SiteHeader />
      <main>
        {/* 1. Hero */}
        <section className={`${l.wrap} ${s.hero}`} aria-labelledby="biz-title">
          <div className={s.heroText}>
            <span className={s.kicker}>
              <Building2 size={16} aria-hidden /> Для компаний
            </span>
            <h1 id="biz-title" className={s.title}>
              Психолог для ваших сотрудников. <span className={s.titleAccent}>Полностью анонимно.</span>
            </h1>
            <p className={l.lead}>
              Сотрудник получает код и общается с проверенным психологом из анонимного аккаунта — без почты, телефона и лица на
              камере. Компания оплачивает созвоны из предоплаченного бюджета и видит только общие цифры.
            </p>
            <div className={s.heroActions}>
              <Button href="#calc" variant="primary" size="lg">
                Рассчитать для компании
              </Button>
              <Button href="#how" variant="soft" size="lg">
                Как это работает
              </Button>
            </div>
            <ul className={s.heroPoints}>
              <li>
                <Lock size={16} aria-hidden /> Работодатель не узнаёт, кто обратился
              </li>
              <li>
                <FileText size={16} aria-hidden /> Счёт, договор и акты
              </li>
            </ul>
          </div>

          <div className={s.heroVisual} aria-hidden>
            <div className={s.mock}>
              <div className={s.mockHead}>
                <span className={s.mockDot} />
                Кабинет компании
              </div>
              <div className={s.mockGrid}>
                <div className={s.mockKpi}>
                  <span>Созвонов в сентябре</span>
                  <strong>38</strong>
                </div>
                <div className={s.mockKpi}>
                  <span>Сотрудников</span>
                  <strong>17</strong>
                </div>
              </div>
              <div className={s.mockRow}>
                <span>Август</span>
                <span className={s.mockHidden}>менее 5</span>
              </div>
              <div className={s.mockRow}>
                <span>Кто обращался</span>
                <span className={s.mockLock}>
                  <EyeOff size={14} /> не показываем
                </span>
              </div>
              <div className={s.mockBars}>
                <span style={{ width: "46%" }} />
                <span style={{ width: "31%" }} />
                <span style={{ width: "23%" }} />
              </div>
              <div className={s.mockNote}>Пример интерфейса, цифры условные</div>
            </div>
            <div className={s.heroArt}>
              <ShieldFriend />
            </div>
          </div>
        </section>

        {/* 2. Anonymity guarantee */}
        <section id="privacy" className={`${l.wrap} ${l.section}`} aria-labelledby="biz-privacy">
          <div className={s.sectionHead}>
            <h2 id="biz-privacy" className={l.sectionTitle}>
              Анонимность — это продукт, а не пункт в договоре
            </h2>
            <p className={l.lead}>
              Люди не пойдут к психологу, если руководитель может об этом узнать. Поэтому связь «сотрудник — аккаунт» не видна
              компании технически: в нашей базе код не хранит, кто его активировал.
            </p>
          </div>
          <div className={s.compare}>
            <div className={`${s.compareCol} ${s.compareSees}`}>
              <h3>
                <BarChart3 size={20} aria-hidden /> Что видит компания
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
                <UserX size={20} aria-hidden /> Чего не видит никто в компании
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
          <div className={s.sectionHead}>
            <h2 id="biz-why" className={l.sectionTitle}>
              Зачем это компании
            </h2>
            <p className={l.lead}>
              Мы не обещаем волшебных процентов. Считайте эффект на своих метриках — текучесть, больничные, вовлечённость — до и
              после пилота.
            </p>
          </div>
          <div className={s.cards}>
            <div className={s.card}>
              <span className={`${s.cardIcon} ${s.tLilac}`}>
                <HeartHandshake size={22} />
              </span>
              <h3>Помощь до выгорания</h3>
              <p>Когда не нужно объяснять руководителю и платить из своего кармана, к специалисту обращаются раньше, а не в кризисе.</p>
            </div>
            <div className={s.card}>
              <span className={`${s.cardIcon} ${s.tMint}`}>
                <ShieldCheck size={22} />
              </span>
              <h3>Без стигмы</h3>
              <p>Ни почты, ни телефона, ни лица на камере: вместо него 3D-аватар. Сотрудник уверен, что об обращении не узнают.</p>
            </div>
            <div className={s.card}>
              <span className={`${s.cardIcon} ${s.tSun}`}>
                <Scale size={22} />
              </span>
              <h3>Предсказуемый бюджет</h3>
              <p>Лимит на человека за месяц, квартал или год. Списываются только состоявшиеся созвоны, отмены возвращаются.</p>
            </div>
          </div>
        </section>

        {/* 4. How it works */}
        <section id="how" className={`${l.wrap} ${l.section}`} aria-labelledby="biz-how">
          <div className={s.sectionHead}>
            <h2 id="biz-how" className={l.sectionTitle}>
              Как это работает
            </h2>
          </div>
          <ol className={s.steps}>
            <li className={s.step}>
              <span className={s.stepNum}>1</span>
              <span className={`${s.cardIcon} ${s.tCyan}`}>
                <Wallet size={22} />
              </span>
              <h3>Компания пополняет бюджет</h3>
              <p>Подписываем договор, выставляем счёт. Вы задаёте лимит на сотрудника и что оплачивает программа.</p>
            </li>
            <li className={s.step}>
              <span className={s.stepNum}>2</span>
              <span className={`${s.cardIcon} ${s.tCoral}`}>
                <KeyRound size={22} />
              </span>
              <h3>HR раздаёт одноразовые коды</h3>
              <p>Выпускаете коды в кабинете и выгружаете в CSV. Раздаёте как удобно: в письме, в чате, на бумаге.</p>
            </li>
            <li className={s.step}>
              <span className={s.stepNum}>3</span>
              <span className={`${s.cardIcon} ${s.tLilac}`}>
                <CalendarCheck2 size={22} />
              </span>
              <h3>Сотрудник записывается анонимно</h3>
              <p>Вводит код в анонимном аккаунте, выбирает психолога — созвоны оплачиваются из программы, дальше при желании сам.</p>
            </li>
          </ol>
        </section>

        {/* 5. Pricing / lead form */}
        <section id="calc" className={`${l.wrap} ${l.section}`} aria-labelledby="biz-calc">
          <div className={s.calc}>
            <div className={s.calcIntro}>
              <h2 id="biz-calc" className={l.sectionTitle}>
                Рассчитать стоимость
              </h2>
              <p className={l.lead}>
                Цена зависит от числа сотрудников и лимита на человека. Можно начать с пилота на один отдел. Оставьте контакты — пришлём
                расчёт и договор.
              </p>
              <ul className={s.calcList}>
                <li>
                  <Check size={18} aria-hidden /> Предоплаченный бюджет, без абонентской платы за «мёртвые души»
                </li>
                <li>
                  <Check size={18} aria-hidden /> Лимит в рублях, в созвонах или и то и другое
                </li>
                <li>
                  <Check size={18} aria-hidden /> Счета и ежемесячные акты для бухгалтерии
                </li>
              </ul>
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
                Вопросы HR и руководителей
              </h2>
              <p className={l.lead}>
                Не нашли ответ? Напишите на <a href="mailto:b2b@aprosop.ru">b2b@aprosop.ru</a>.
              </p>
              <Together className={s.faqArt} />
            </div>
            <BizFaq />
          </div>
        </section>

        {/* 7. CTA */}
        <section className={`${l.wrap} ${l.section}`} aria-labelledby="biz-closing">
          <div className={l.closing}>
            <div>
              <h2 id="biz-closing">Забота, о которой не нужно докладывать</h2>
              <p>Запустим пилот за неделю: договор, счёт, коды для первого отдела.</p>
            </div>
            <div className={l.closingActions}>
              <Button href="#calc" variant="primary" size="lg">
                Рассчитать для компании
              </Button>
              <Button href="/login" variant="soft" size="lg">
                Вход для HR
              </Button>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
      <JsonLd data={serviceLd} />
      <JsonLd data={bizFaqLd()} />
    </div>
  );
}
