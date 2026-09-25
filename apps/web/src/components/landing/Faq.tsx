"use client";

import { useId, useState, type ReactNode } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Together } from "@/components/illustrations";
import a from "./art.module.css";
import s from "./landing.module.css";

const ITEMS: { q: string; a: ReactNode }[] = [
  {
    q: "Нужны ли почта или телефон?",
    a: "Нет. Для регистрации нужен только пароль. Имя вроде «тихий-кит-4821» и ключ восстановления сервис создаёт сам.",
  },
  {
    q: "Что будет, если я забуду пароль?",
    a: (
      <>
        Доступ вернёт ключ восстановления, который мы показываем один раз при регистрации. Введите его вместе с именем
        на странице <Link href="/recover">восстановления</Link>. Без ключа вернуть аккаунт не получится: мы не знаем,
        кто вы, и не можем это проверить.
      </>
    ),
  },
  {
    q: "Увидит ли психолог моё лицо?",
    a: "Нет. Камера распознаёт мимику на вашем устройстве, а специалисту передаётся только анимированный аватар.",
  },
  {
    q: "Можно ли изменить голос?",
    a: "Да. Во время звонка можно включить фильтр голоса. Он работает на вашем устройстве, специалист слышит уже изменённый голос.",
  },
  {
    q: "Записываются ли сессии?",
    a: "Нет. Видео и звук идут напрямую между вашим браузером и браузером специалиста в зашифрованном виде. На наш сервер они не попадают, поэтому записать их мы не можем.",
  },
  {
    q: "Что вы видите при оплате?",
    a: "Оплата проходит через платёжный сервис. Мы получаем только подтверждение, что сессия оплачена, и сумму. Номер карты и имя плательщика к нам не приходят.",
  },
  {
    q: "Как удалить аккаунт?",
    a: "В настройках кабинета нажмите «Удалить аккаунт» и подтвердите паролем. Мы сотрём имя, аватар, записи на сессии и историю оплат. Отменить удаление нельзя.",
  },
  {
    q: "Подойдёт ли сервис, если мне очень плохо прямо сейчас?",
    a: "Если вам угрожает опасность, звоните 112. Детский телефон доверия 8-800-2000-122 бесплатный и работает круглосуточно, туда могут звонить и подростки, и родители. Сессию с психологом у нас можно назначить не раньше чем через час.",
  },
];

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  const base = useId();

  return (
    <section id="faq" className={`${s.wrap} ${s.section}`} aria-labelledby="faq-title">
      <div className={s.faq}>
        <div className={s.faqIntro}>
          <h2 id="faq-title" className={s.sectionTitle}>
            Вопросы, которые задают чаще всего
          </h2>
          <p className={s.lead}>
            Не нашли ответ? Напишите на <a href="mailto:support@aprosop.ru">support@aprosop.ru</a>. Представляться не
            нужно.
          </p>
          <Together className={a.faqArt} />
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
