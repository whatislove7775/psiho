import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/AppShell";
import { MatchQuiz } from "@/components/matching/MatchQuiz";

export const metadata: Metadata = { title: "Подбор специалиста" };

export default function MatchPage() {
  return (
    <>
      <PageHeader
        title="Подбор специалиста"
        sub="Пять коротких вопросов — и мы покажем, кто подойдёт и почему. Ответы не сохраняются на сервере."
      />
      <MatchQuiz mode="app" />
    </>
  );
}
