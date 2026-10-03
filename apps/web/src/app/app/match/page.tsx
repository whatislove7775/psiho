import { t } from "@/lib/i18n";
import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/AppShell";
import { MatchQuiz } from "@/components/matching/MatchQuiz";

export function generateMetadata(): Metadata {
  return { title: t("Подбор специалиста") };
}

export default function MatchPage() {
  return (
    <>
      <PageHeader
        title={t("Подбор специалиста")}
        sub={t("Пять коротких вопросов")}
      />
      <MatchQuiz mode="app" />
    </>
  );
}
