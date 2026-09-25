"use client";

import { ArrowLeft, HeartHandshake, Lock, Phone, Sparkles, XCircle } from "lucide-react";
import { useState } from "react";
import { Button, useToast } from "@/ui";
import { chatApi, type AIStatus } from "@/lib/api/chat";
import { Tisha } from "./Tisha";
import s from "./chat.module.css";

/** Знакомство с Тишей + явное согласие перед первым использованием. */
export function AIIntro({
  status,
  onConsent,
  onBack,
}: {
  status: AIStatus | null;
  onConsent: (st: AIStatus) => void;
  onBack: () => void;
}) {
  const toast = useToast();
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const enabled = !!status?.enabled;

  const accept = async () => {
    setBusy(true);
    try {
      onConsent(await chatApi.aiConsent());
    } catch {
      toast("Не получилось сохранить согласие", { error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={`${s.view} ${s.introView}`} aria-label="Знакомство с Тишей">
      <header className={`${s.viewHead} ${s.introHead}`}>
        <button type="button" className={`${s.iconBtn} ${s.backBtn}`} onClick={onBack} aria-label="Назад к списку чатов">
          <ArrowLeft size={20} />
        </button>
      </header>
      <div className={s.intro}>
        <div className={s.introHero}>
          <div className={s.introMascot}>
            <Tisha size={132} state={enabled ? "idle" : "sleep"} />
          </div>
          <h2 className={s.introTitle}>{enabled ? "Знакомьтесь, это Тиша" : "Тиша скоро появится"}</h2>
          <p className={s.introLead}>
            {enabled
              ? "ИИ-помощник aprosop. Тиша выслушает без оценок, поможет разобраться в мыслях и чувствах и предложит простую практику — в любое время дня и ночи."
              : "Мы готовим ИИ-помощника, который поможет выговориться и разобраться в мыслях в любое время. А пока можно написать специалисту или в поддержку."}
          </p>
        </div>

        <div className={s.introGrid}>
          <div className={s.introCard}>
            <div className={s.introCardHead}>
              <span className={`${s.introIcon} ${s.pMint}`}>
                <Sparkles size={18} />
              </span>
              Что умеет Тиша
            </div>
            <ul>
              <li>Выслушать и помочь назвать, что вы чувствуете</li>
              <li>Разобрать тревожные мысли по шагам (методы КПТ и ACT)</li>
              <li>Подобрать дыхательную практику или заземление</li>
              <li>Помочь подготовиться к созвону со специалистом</li>
            </ul>
          </div>
          <div className={s.introCard}>
            <div className={s.introCardHead}>
              <span className={`${s.introIcon} ${s.pPeach}`}>
                <XCircle size={18} />
              </span>
              Чего Тиша не делает
            </div>
            <ul>
              <li>Тиша — не психолог и не врач</li>
              <li>Не ставит диагнозы и не назначает лечение</li>
              <li>Не заменяет живого специалиста — и подскажет, когда к нему стоит обратиться</li>
            </ul>
          </div>
          <div className={`${s.introCard} ${s.introCrisis}`}>
            <div className={s.introCardHead}>
              <span className={`${s.introIcon} ${s.pButter}`}>
                <Phone size={18} />
              </span>
              Если очень плохо прямо сейчас
            </div>
            <ul className={s.phones}>
              <li>
                <a href="tel:112">112</a> — экстренные службы, бесплатно с любого телефона
              </li>
              <li>
                <a href="tel:88002000122">8-800-2000-122</a> — детский телефон доверия для подростков и родителей
              </li>
              <li>
                <a href="tel:051">051</a> — экстренная психологическая помощь в Москве (с мобильного{" "}
                <a href="tel:+7495051">+7 495 051</a>)
              </li>
            </ul>
          </div>
          <div className={s.introCard}>
            <div className={s.introCardHead}>
              <span className={`${s.introIcon} ${s.pSky}`}>
                <Lock size={18} />
              </span>
              Как это устроено
            </div>
            <p>
              Сообщения Тише обрабатывает ИИ-модель Claude компании Anthropic. Мы передаём только текст вашей переписки с
              Тишей — без псевдонима, аватара и других данных аккаунта, а email и телефоны скрываем автоматически. Не
              пишите имён, адресов и того, по чему вас можно узнать.
            </p>
          </div>
        </div>

        {enabled ? (
          <div className={s.consent}>
            <label className={s.consentLabel}>
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
              <span>
                Я понимаю, что Тиша — это ИИ, а не специалист, и согласен(на), что мои сообщения Тише будут обработаны
                ИИ-провайдером. Согласие можно отозвать в меню чата.
              </span>
            </label>
            <Button variant="primary" size="lg" disabled={!agree} loading={busy} onClick={accept} icon={<HeartHandshake size={20} />}>
              Начать разговор
            </Button>
          </div>
        ) : (
          <div className={s.consent}>
            <Button variant="secondary" size="lg" href="/app/specialists">
              Выбрать специалиста
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
