import type { Metadata } from "next";
import { PublicShell } from "@/components/public/PublicShell";
import { MatchQuiz } from "@/components/matching/MatchQuiz";
import { alternates } from "@/lib/seo";
import { ogMeta } from "@/lib/og/sections";
import s from "@/components/matching/matchPage.module.css";

const TITLE = "Подбор психолога по анкете";
const DESCRIPTION =
  "Пять коротких вопросов о том, что беспокоит, каким должен быть специалист и когда удобно. Покажем, кто подходит и почему. Без регистрации, ответы не сохраняются.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: alternates("/match"),
  ...ogMeta("/match", "Подбор психолога", DESCRIPTION),
};

export default function PublicMatchPage() {
  return (
    <PublicShell narrow>
      <header className={s.head}>
        <h1 className={s.title}>Подберём психолога за пару минут</h1>
        <p className={s.sub}>
          Пять коротких вопросов — и вы увидите, кто подходит и почему. Без регистрации; ответы не уходят на сервер
          дальше самого подбора.
        </p>
      </header>
      <MatchQuiz mode="public" />
    </PublicShell>
  );
}
