"use client";

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
      <PageHeader title="Программа" sub="Сколько компания оплачивает каждому сотруднику и за что." />
      {data.error ? (
        <ErrorBlock message={data.error} onRetry={data.reload} />
      ) : (
        <WithRail
          rail={
            <Card as="section">
              <CardHead title="Как списываются деньги" icon={<Info size={18} />} />
              <ul className={s.muted} style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
                <li>Созвон оплачивается сначала из программы, остаток — с личного баланса сотрудника.</li>
                <li>Деньги уходят из бюджета, только когда созвон состоялся. Отмена специалистом — полный возврат в бюджет.</li>
                <li>Лимит обновляется в начале каждого периода. Неиспользованный остаток не переносится и остаётся в бюджете компании.</li>
                <li>Если бюджет закончился, сотрудник может платить сам — программа снова заработает после пополнения.</li>
              </ul>
            </Card>
          }
        >
          <Card as="section">
            <CardHead title="Настройки" icon={<SlidersHorizontal size={18} />} />
            {!data.data ? (
              <Skeleton height={320} radius={14} />
            ) : !data.data.program ? (
              <p className={s.muted}>Программа ещё не настроена. Напишите менеджеру — он поможет подобрать лимиты.</p>
            ) : (
              <ProgramForm
                key={data.data.program.id}
                program={data.data.program}
                onSave={async (body) => {
                  const r = await businessApi.updateProgram(body);
                  data.setData({ ...data.data!, program: r.program });
                  toast("Программа сохранена");
                }}
              />
            )}
          </Card>
        </WithRail>
      )}
    </>
  );
}
