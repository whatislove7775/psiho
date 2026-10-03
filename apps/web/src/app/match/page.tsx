import { t, msg } from "@/lib/i18n";
import type { Metadata } from "next";
import { PublicShell } from "@/components/public/PublicShell";
import { MatchQuiz } from "@/components/matching/MatchQuiz";
import { MagnifierFind } from "@/components/illustrations";
import { alternates } from "@/lib/seo";
import { ogMeta } from "@/lib/og/sections";
import s from "@/components/matching/matchPage.module.css";

const TITLE = msg("Подбор психолога по\u00a0анкете");
const DESCRIPTION =
  msg("Пять коротких вопросов о\u00a0том, что\u00a0беспокоит, каким должен быть специалист и\u00a0когда удобно. Покажем, кто подходит и\u00a0почему. Без\u00a0регистрации, ответы не\u00a0сохраняются.");

export function generateMetadata(): Metadata {
  return {
    title: t(TITLE),
    description: t(DESCRIPTION),
    alternates: alternates("/match"),
    ...ogMeta("/match", t("Подбор психолога"), t(DESCRIPTION)),
  };
}

export default function PublicMatchPage() {
  return (
    <PublicShell narrow>
      <header className={`${s.head} ${s.headWithArt}`}>
        <div className={s.head}>
          <h1 className={s.title}>{t("Подберём психолога за\u00a0пару минут")}</h1>
          <p className={s.sub}>{t("Пять коротких вопросов\u00a0— и\u00a0вы\u00a0увидите, кто подходит и\u00a0почему. Без\u00a0регистрации.")}</p>
        </div>
        <MagnifierFind className={s.headArt} />
      </header>
      <MatchQuiz mode="public" />
    </PublicShell>
  );
}
