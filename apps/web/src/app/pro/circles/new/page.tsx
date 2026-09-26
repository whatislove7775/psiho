"use client";

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
      <PageHeader title="Новый круг" sub="Сначала сохраним черновик — отправить на проверку можно на следующем шаге." />
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
