"use client";

import { t } from "@/lib/i18n";
import { PageHeader, WithRail } from "@/components/shell/AppShell";
import { useAuth } from "@/lib/auth/store";
import { AliasCard } from "@/components/client/AliasCard";
import { PrivacyAndSecurity } from "@/components/client/PrivacyAndSecurity";
import s from "./privacy.module.css";

export default function PrivacyPage() {
  const user = useAuth((st) => st.user);
  return (
    <>
      <PageHeader title={t("Приватность")} />
      <WithRail
        rail={
          user ? (
            <div className={s.wideOnly}>
              <AliasCard user={user} />
            </div>
          ) : null
        }
      >
        <PrivacyAndSecurity />
      </WithRail>
    </>
  );
}
