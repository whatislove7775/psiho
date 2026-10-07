"use client";

import { t, tj } from "@/lib/i18n";
import { lp } from "@/lib/i18n";
import { useId, useState, type ReactNode } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { AvatarDecor } from "@/components/decor/AvatarDecor";
import s from "./landing.module.css";

const ITEMS: { q: string; a: ReactNode }[] = [
  {
    get q() { return t("Нужны ли почта или телефон?"); },
    get a() { return t("Нет. Для\u00a0регистрации нужен только пароль. Имя вроде «тихий-кит-4821» и\u00a0ключ восстановления сервис создаёт сам."); },
  },
  {
    get q() { return t("Что будет, если я забуду пароль?"); },
    get a() {
      return tj("Доступ вернёт ключ восстановления, который мы\u00a0показываем один раз при\u00a0регистрации. Введите его вместе с\u00a0именем на\u00a0странице {link}. Без\u00a0ключа вернуть аккаунт не\u00a0получится: мы\u00a0не\u00a0знаем, кто вы, и\u00a0не\u00a0можем это\u00a0проверить.", {
        link: <Link href={lp("/recover")}>{t("восстановления")}</Link>,
      });
    },
  },
  {
    get q() { return t("Увидит ли психолог моё лицо?"); },
    get a() { return t("Нет. Камера распознаёт мимику на\u00a0вашем устройстве, а\u00a0специалисту передаётся только анимированный аватар."); },
  },
  {
    get q() { return t("Записываются ли созвоны?"); },
    get a() { return t("Нет. Видео и\u00a0звук передаются между вашим браузером и\u00a0браузером специалиста в\u00a0зашифрованном виде. При необходимости соединение проходит через сервер-посредник. Мы не записываем созвоны. При этом браузер не может запретить собеседнику записать свой экран или звук."); },
  },
  {
    get q() { return t("Что вы видите при оплате?"); },
    get a() { return t("Оплата проходит через платёжный сервис. Мы\u00a0получаем только подтверждение, что\u00a0созвон оплачен, и\u00a0сумму. Номер карты и\u00a0имя плательщика к\u00a0нам не\u00a0приходят."); },
  },
  {
    get q() { return t("Подойдёт ли сервис, если мне очень плохо прямо сейчас?"); },
    get a() { return t("Если вам угрожает опасность, звоните 112. Детский телефон доверия 8-800-2000-122\u00a0бесплатный и\u00a0работает круглосуточно, туда могут звонить и\u00a0подростки, и\u00a0родители. Сессию с\u00a0психологом у\u00a0нас можно назначить не\u00a0раньше чем\u00a0через час."); },
  },
];

export function Faq() {
  const [open, setOpen] = useState<number | null>(null);
  const base = useId();

  return (
    <section id="faq" className={`${s.wrap} ${s.section}`} aria-labelledby="faq-title">
      <div className={s.faq}>
        <div className={s.faqIntro}>
          <h2 id="faq-title" className={s.sectionTitle}>
            {t("Вопросы")}
          </h2>
          <p className={s.sectionSub}>
            {t("Не\u00a0нашли ответ?")}{" "}<a href="mailto:support@aprosop.ru">support@aprosop.ru</a>
          </p>
          <AvatarDecor heads={["mila"]} size={190} from={1200} className={s.faqDecor} />
        </div>
        <div className={s.faqList}>
          {ITEMS.map((item, i) => {
            const isOpen = open === i;
            const btnId = `${base}-q${i}`;
            const panelId = `${base}-a${i}`;
            return (
              <div key={item.q} className={s.faqItem}>
                <h3 className={s.faqQ}>
                  <button
                    id={btnId}
                    type="button"
                    className={s.faqBtn}
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => setOpen(isOpen ? null : i)}
                  >
                    {item.q}
                    <span className={s.faqChevron} aria-hidden>
                      <Plus size={18} strokeWidth={1.8} />
                    </span>
                  </button>
                </h3>
                <div
                  id={panelId}
                  role="region"
                  aria-labelledby={btnId}
                  className={s.faqPanel}
                  data-open={isOpen}
                  ref={(el) => {
                    // React 18 has no `inert` prop; keep links in closed answers out of the tab order.
                    if (el) el.toggleAttribute("inert", !isOpen);
                  }}
                >
                  <div>
                    <p>{item.a}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
