"use client";

import { Card, CardHead } from "@/ui";
import { PageHeader } from "@/components/shell/AppShell";
import { contentApi, PRACTICE_KINDS } from "@/lib/api/content";
import { useLoad } from "@/components/client/useLoad";
import { ErrorBlock } from "@/components/client/ClientBits";
import { PracticeCard, PracticeCardSkeleton } from "@/components/content/Cards";
import c from "@/components/content/content.module.css";

export default function PracticesPage() {
  const practices = useLoad(() => contentApi.practices());
  const list = practices.data ?? [];
  const groups = PRACTICE_KINDS.map((k) => ({ ...k, items: list.filter((p) => p.kind === k.value) })).filter(
    (g) => g.items.length,
  );

  return (
    <>
      <PageHeader
        title="Практики"
        sub="Короткие упражнения на каждый день. Их можно делать между созвонами, перед сном или когда накрывает тревога."
      />
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
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {groups.map((g) => (
            <Card as="section" key={g.value}>
              <CardHead title={g.label} />
              <div className={c.practiceGrid}>
                {g.items.map((p) => (
                  <PracticeCard key={p.id} p={p} />
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
