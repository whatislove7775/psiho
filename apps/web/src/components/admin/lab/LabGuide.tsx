"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BadgeCheck, ChevronDown, LifeBuoy, MonitorSmartphone, Repeat } from "lucide-react";
import s from "./lab.module.css";

const KEY = "aprosop.lab.guide";

/** Short how-to at the top of the lab. Remembers whether it was folded (this browser only). */
export function LabGuide({ onTab }: { onTab: (tab: "call" | "network") => void }) {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      // folded by default on phones, where it would push the tools far down
      if (saved === "closed" || (!saved && window.matchMedia("(max-width: 640px)").matches)) setOpen(false);
    } catch {
      /* ignore */
    }
  }, []);
  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      localStorage.setItem(KEY, next ? "open" : "closed");
    } catch {
      /* ignore */
    }
  };

  return (
    <section className={s.guide} data-open={open || undefined}>
      <button type="button" className={s.guideHead} onClick={toggle} aria-expanded={open}>
        <span>
          <span className={s.guideKicker}>Шпаргалка</span>
          <span className={s.guideTitle}>Как проверить сервис перед реальными клиентами</span>
        </span>
        <ChevronDown size={20} className={s.guideChevron} />
      </button>
      {open && (
        <div className={s.guideBody}>
          <article className={s.guideStep} data-tone="mint">
            <span className={s.guideIcon}>
              <BadgeCheck size={20} />
            </span>
            <h3>Одобрить специалиста</h3>
            <ol>
              <li>
                Откройте <Link href="/admin/specialists">Специалисты</Link>, вкладка «На проверке».
              </li>
              <li>Раскройте анкету: проверьте фото, ФИО, диплом и телефон, отметки рядом показывают, что загружено.</li>
              <li>
                Нажмите «Одобрить». Карточка сразу появится в каталоге. Если чего-то не хватает, «Отклонить» с причиной: специалист увидит её в
                кабинете.
              </li>
            </ol>
          </article>

          <article className={s.guideStep} data-tone="sky">
            <span className={s.guideIcon}>
              <MonitorSmartphone size={20} />
            </span>
            <h3>Звонок на двух устройствах</h3>
            <ol>
              <li>
                Во вкладке{" "}
                <button type="button" className={s.linkBtn} onClick={() => onTab("call")}>
                  «Тестовый звонок»
                </button>{" "}
                нажмите «Создать комнату».
              </li>
              <li>На ноутбуке нажмите «Открыть в новой вкладке» у ссылки «Как специалист».</li>
              <li>Телефоном отсканируйте QR-код «Как клиент». Входить в аккаунт на телефоне не нужно.</li>
              <li>На обоих устройствах разрешите камеру и микрофон и нажмите «Присоединиться». Специалист увидит аватар, клиент увидит камеру.</li>
            </ol>
          </article>

          <article className={s.guideStep} data-tone="lilac">
            <span className={s.guideIcon}>
              <Repeat size={20} />
            </span>
            <h3>Одно устройство</h3>
            <ol>
              <li>«Проверка на одном устройстве» внизу вкладки звонка отправляет видео самому себе и показывает, что получит собеседник.</li>
              <li>Включите «Только через TURN», чтобы убедиться, что звонок пройдёт даже через строгий NAT.</li>
            </ol>
          </article>

          <article className={s.guideStep} data-tone="peach">
            <span className={s.guideIcon}>
              <LifeBuoy size={20} />
            </span>
            <h3>Если не соединяется</h3>
            <ol>
              <li>
                Вкладка{" "}
                <button type="button" className={s.linkBtn} onClick={() => onTab("network")}>
                  «Сеть»
                </button>{" "}
                проверит STUN, TURN и сигнальный сервер.
              </li>
              <li>Тестовые комнаты живут 2 часа, не попадают в статистику, выручку и выплаты и не видны специалистам.</li>
            </ol>
          </article>
        </div>
      )}
    </section>
  );
}
