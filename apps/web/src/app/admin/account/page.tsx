"use client";

import { PageHeader } from "@/components/shell/AppShell";
import { useStaff } from "@/components/admin/AdminShell";
import { PasswordCard, TotpCard } from "@/components/admin/StaffGate";
import { KV, RoleBadge } from "@/components/admin/kit";
import { Card, CardHead } from "@/ui";
import s from "@/components/admin/staff.module.css";

export default function AccountPage() {
  const { me, reload } = useStaff();
  return (
    <>
      <PageHeader title="Мой доступ" />
      <div className={s.narrow}>
        <Card as="section">
          <CardHead title="Аккаунт" />
          <KV
            items={[
              ["Логин", me.alias],
              ["Роль", <RoleBadge key="r" role={me.role} />],
              ["Разделов доступно", me.permissions.length],
            ]}
          />
        </Card>
        <TotpCard enabled={me.totp_enabled} required={me.totp_required} onDone={reload} />
        <PasswordCard />
      </div>
    </>
  );
}
