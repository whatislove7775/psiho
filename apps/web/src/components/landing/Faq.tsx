"use client";

import { useId, useState, type ReactNode } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { AvatarDecor } from "@/components/decor/AvatarDecor";
import s from "./landing.module.css";

const ITEMS: { q: string; a: ReactNode }[] = [
  {
    q: "Нужны ли почта или телефон?",
    a: "Нет. Для\u00a0регистрации нужен только пароль. Имя вроде «тихий-кит-4821» и\u00a0ключ восстановления сервис создаёт сам.",
  },
  {
    q: "Что будет, если я забуду пароль?",
    a: (
      <>
        Доступ вернёт ключ восстановления, который мы&nbsp;показываем один раз при&nbsp;регистрации. Введите его вместе с&nbsp;именем
        на&nbsp;странице <Link href="/recover">восстановления</Link>. Без&nbsp;ключа вернуть аккаунт не&nbsp;получится: мы&nbsp;не&nbsp;знаем,
        кто вы, и&nbsp;не&nbsp;можем это&nbsp;проверить.
      </>
    ),
  },
  {
    q: "Увидит ли психолог моё лицо?",
    a: "Нет. Камера распознаёт мимику на\u00a0вашем устройстве, а\u00a0специалисту передаётся только анимированный аватар.",
  },
  {
    q: "Записываются ли созвоны?",
    a: "Нет. Видео и\u00a0звук идут напрямую между вашим браузером и\u00a0браузером специалиста в\u00a0зашифрованном виде. На\u00a0наш сервер они не\u00a0попадают, поэтому записать их\u00a0мы\u00a0не\u00a0можем.",
  },
  {
    q: "Что вы видите при оплате?",
    a: "Оплата проходит через платёжный сервис. Мы\u00a0получаем только подтверждение, что\u00a0созвон оплачен, и\u00a0сумму. Номер карты и\u00a0имя плательщика к\u00a0нам не\u00a0приходят.",
  },
  {
    q: "Подойдёт ли сервис, если мне очень плохо прямо сейчас?",
    a: "Если вам угрожает опасность, звоните 112. Детский телефон доверия 8-800-2000-122\u00a0бесплатный и\u00a0работает круглосуточно, туда могут звонить и\u00a0подростки, и\u00a0родители. Сессию с\u00a0психологом у\u00a0нас можно назначить не\u00a0раньше чем\u00a0через час.",
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
            Вопросы
          </h2>
          <p className={s.sectionSub}>
            Не&nbsp;нашли ответ? <a href="mailto:support@aprosop.ru">support@aprosop.ru</a>
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
