"use client";

import { t } from "@/lib/i18n";
import { ArrowLeft, HeartHandshake, Lock, Sparkles, XCircle } from "lucide-react";
import { HelpLine } from "@/components/client/HelpLine";
import { useState } from "react";
import { Button, useToast } from "@/ui";
import { chatApi, type AIStatus } from "@/lib/api/chat";
import { Tisha } from "./Tisha";
import s from "./chat.module.css";
import { SearchTrigger } from "@/components/search/SpecialistSearch";

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
      toast(t("Не\u00a0получилось сохранить согласие"), { error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={`${s.view} ${s.introView}`} aria-label={t("Знакомство с\u00a0Тишей")}>
      <header className={`${s.viewHead} ${s.introHead}`}>
        <button type="button" className={`${s.iconBtn} ${s.backBtn}`} onClick={onBack} aria-label={t("Назад к\u00a0списку чатов")}>
          <ArrowLeft size={20} />
        </button>
      </header>
      <div className={s.intro}>
        <div className={s.introHero}>
          <div className={s.introMascot}>
            <Tisha size={96} state={enabled ? "idle" : "sleep"} />
          </div>
          <h2 className={s.introTitle}>{enabled ? t("Знакомьтесь, это\u00a0Тиша") : t("Тиша скоро появится")}</h2>
          <p className={s.introLead}>
            {enabled
              ? t("ИИ-помощник, который рядом в\u00a0любое время.")
              : t("Мы\u00a0готовим ИИ-помощника. А\u00a0пока можно написать специалисту или\u00a0в\u00a0поддержку.")}
          </p>
        </div>

        <ul className={s.introPoints}>
          <li>
            <Sparkles size={16} aria-hidden />{" "}{t("Выслушает, поможет разобрать мысли и\u00a0подберёт практику")}
          </li>
          <li>
            <XCircle size={16} aria-hidden />{" "}{t("Не\u00a0психолог и\u00a0не\u00a0врач, диагнозов не\u00a0ставит")}
          </li>
          <li>
            <Lock size={16} aria-hidden />{" "}{t("Текст обрабатывает ИИ\u00a0Claude (Anthropic) без\u00a0псевдонима и\u00a0данных аккаунта. Не\u00a0пишите имён и\u00a0адресов.")}
          </li>
        </ul>
        <HelpLine className={s.introHelp} />

        {enabled ? (
          <div className={s.consent}>
            <label className={s.consentLabel}>
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
              <span>
                {t("Понимаю, что\u00a0Тиша\u00a0— ИИ, и\u00a0согласен(на) на\u00a0обработку сообщений ИИ-провайдером. Отозвать можно в\u00a0меню чата.")}
              </span>
            </label>
            <Button variant="primary" size="lg" disabled={!agree} loading={busy} onClick={accept} icon={<HeartHandshake size={20} />}>
              {t("Начать разговор")}
            </Button>
          </div>
        ) : (
          <div className={s.consent}>
            <SearchTrigger variant="secondary" size="lg">
              {t("Выбрать специалиста")}
            </SearchTrigger>
          </div>
        )}
      </div>
    </section>
  );
}
