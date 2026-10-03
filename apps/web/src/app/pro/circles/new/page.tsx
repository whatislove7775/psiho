"use client";

import { t } from "@/lib/i18n";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card } from "@/ui";
import { PageHeader } from "@/components/shell/AppShell";
import { ProCircleForm } from "@/components/circles/ProCircleForm";
import { circlesApi, type CircleWrite } from "@/lib/api/circles";

export default function NewCirclePage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  return (
    <>
      <PageHeader title={t("Новый круг")} sub={t("Сначала сохраним черновик\u00a0— отправить на\u00a0проверку можно на\u00a0следующем шаге.")} />
      <Card>
        <ProCircleForm
          saving={saving}
          onSave={async (body) => {
            setSaving(true);
            try {
              const c = await circlesApi.proCreate(body as CircleWrite);
              router.push(`/pro/circles/${c.id}`);
            } finally {
              setSaving(false);
            }
          }}
        />
      </Card>
    </>
  );
}
