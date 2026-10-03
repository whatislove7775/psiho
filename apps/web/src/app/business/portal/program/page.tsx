"use client";

import { t } from "@/lib/i18n";
import { Info, SlidersHorizontal } from "lucide-react";
import { Card, CardHead, Skeleton, useToast } from "@/ui";
import { PageHeader, WithRail } from "@/components/shell/AppShell";
import { useLoad } from "@/components/client/useLoad";
import { ErrorBlock } from "@/components/client/ClientBits";
import { ProgramForm } from "@/components/business/ProgramForm";
import { businessApi } from "@/lib/api/business";
import s from "@/components/business/business.module.css";

export default function ProgramPage() {
  const toast = useToast();
  const data = useLoad(() => businessApi.program(), []);
  return (
    <>
      <PageHeader title={t("Программа")} sub={t("Сколько компания оплачивает каждому сотруднику и\u00a0за\u00a0что.")} />
      {data.error ? (
        <ErrorBlock message={data.error} onRetry={data.reload} />
      ) : (
        <WithRail
          rail={
            <Card as="section">
              <CardHead title={t("Как\u00a0списываются деньги")} icon={<Info size={18} />} />
              <ul className={s.muted} style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
                <li>{t("Созвон оплачивается сначала из\u00a0программы, остаток\u00a0— с\u00a0личного баланса сотрудника.")}</li>
                <li>{t("Деньги уходят из\u00a0бюджета, только когда созвон состоялся. Отмена специалистом\u00a0— полный возврат в\u00a0бюджет.")}</li>
                <li>{t("Лимит обновляется в\u00a0начале каждого периода. Неиспользованный остаток не\u00a0переносится и\u00a0остаётся в\u00a0бюджете компании.")}</li>
                <li>{t("Если бюджет закончился, сотрудник может платить сам\u00a0— программа снова заработает после пополнения.")}</li>
              </ul>
            </Card>
          }
        >
          <Card as="section">
            <CardHead title={t("Настройки")} icon={<SlidersHorizontal size={18} />} />
            {!data.data ? (
              <Skeleton height={320} radius={14} />
            ) : !data.data.program ? (
              <p className={s.muted}>{t("Программа ещё не\u00a0настроена. Напишите менеджеру\u00a0— он\u00a0поможет подобрать лимиты.")}</p>
            ) : (
              <ProgramForm
                key={data.data.program.id}
                program={data.data.program}
                onSave={async (body) => {
                  const r = await businessApi.updateProgram(body);
                  data.setData({ ...data.data!, program: r.program });
                  toast(t("Программа сохранена"));
                }}
              />
            )}
          </Card>
        </WithRail>
      )}
    </>
  );
}
