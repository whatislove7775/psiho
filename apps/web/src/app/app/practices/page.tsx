"use client";

import { Card } from "@/ui";
import { PageHeader } from "@/components/shell/AppShell";
import { contentApi, PRACTICE_KINDS } from "@/lib/api/content";
import { useLoad } from "@/components/client/useLoad";
import { ErrorBlock } from "@/components/client/ClientBits";
import { PracticeCard, PracticeCardSkeleton } from "@/components/content/Cards";
import c from "@/components/content/content.module.css";
import { UsefulTabs } from "@/components/content/UsefulTabs";
import u from "@/components/content/usefulTabs.module.css";

export default function PracticesPage() {
  const practices = useLoad(() => contentApi.practices());
  const list = practices.data ?? [];
  const groups = PRACTICE_KINDS.map((k) => ({ ...k, items: list.filter((p) => p.kind === k.value) })).filter(
    (g) => g.items.length,
  );

  return (
    <>
      <PageHeader
        title="Полезное"
      />
      <UsefulTabs />
      {practices.error ? (
        <ErrorBlock message={practices.error} onRetry={practices.reload} />
      ) : practices.loading && !practices.data ? (
        <Card>
          <div className={c.practiceGrid}>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <PracticeCardSkeleton key={i} />
            ))}
          </div>
        </Card>
      ) : (
        <div className={u.groups}>
          {groups.map((g) => (
            <section key={g.value} className={u.group} aria-labelledby={`pg-${g.value}`}>
              <h2 id={`pg-${g.value}`} className={u.groupTitle}>
                {g.label}
                <span>{g.items.length}</span>
              </h2>
              <div className={c.practiceGrid}>
                {g.items.map((p) => (
                  <PracticeCard key={p.id} p={p} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
