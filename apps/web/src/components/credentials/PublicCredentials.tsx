"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, Check } from "lucide-react";
import { Card, CardHead, Skeleton } from "@/ui";
import { credentialsApi, periodLabel, type CredentialKind, type PublicCredential } from "@/lib/api/credentials";
import { plural } from "@/lib/format";
import { DocTile, DocViewer } from "./DocViewer";
import { KIND_ICON } from "./kinds";
import s from "./credentials.module.css";

const GROUPS: { title: string; kinds: CredentialKind[] }[] = [
  { title: "Образование", kinds: ["diploma", "retraining"] },
  { title: "Методы, курсы и тренинги", kinds: ["method", "course", "other"] },
  { title: "Супервизия", kinds: ["supervision"] },
  { title: "Профессиональные сообщества", kinds: ["membership"] },
  { title: "Публикации", kinds: ["publication"] },
];

/** «Проверено aprosop» — only when at least one document was verified by staff. */
export function VerifiedBadge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <a className={s.verified} href="#credentials">
      <span className={s.verifiedIcon} aria-hidden>
        <BadgeCheck size={14} strokeWidth={2.2} />
      </span>
      Проверено aprosop
      <small>
        {count} {plural(count, "документ", "документа", "документов")}
      </small>
    </a>
  );
}

/** Education / supervision / publications timeline on the public specialist page. */
export function PublicCredentials({ psychologistId }: { psychologistId: number }) {
  const [items, setItems] = useState<PublicCredential[] | null>(null);
  const [viewer, setViewer] = useState<{ item: PublicCredential; index: number } | null>(null);

  useEffect(() => {
    let alive = true;
    credentialsApi
      .public(psychologistId)
      .then((x) => alive && setItems(x))
      .catch(() => alive && setItems([]));
    return () => {
      alive = false;
    };
  }, [psychologistId]);

  if (items && items.length === 0) return null;

  return (
    <Card as="section">
      <span id="credentials" style={{ display: "block", scrollMarginTop: 16 }} />
      <CardHead
        title="Образование и квалификация"
        sub="Каждый пункт сотрудник aprosop сверил с документом. Номера документов скрыты"
      />
      {!items ? (
        <div style={{ display: "grid", gap: 12 }}>
          <Skeleton height={48} />
          <Skeleton height={48} />
        </div>
      ) : (
        <div className={s.groups}>
          {GROUPS.map((g) => {
            const list = items
              .filter((c) => g.kinds.includes(c.kind))
              .sort((a, b) => (b.year_end ?? b.year ?? 0) - (a.year_end ?? a.year ?? 0));
            if (!list.length) return null;
            const Icon = KIND_ICON[g.kinds[0]].icon;
            return (
              <div key={g.title}>
                <h3 className={s.groupTitle}>
                  <Icon size={16} strokeWidth={1.8} aria-hidden />
                  {g.title}
                </h3>
                <ol className={s.timeline}>
                  {list.map((c) => (
                    <Entry key={c.id} c={c} onOpen={(index) => setViewer({ item: c, index })} />
                  ))}
                </ol>
              </div>
            );
          })}
        </div>
      )}
      <DocViewer
        files={viewer?.item.files ?? []}
        index={viewer ? viewer.index : null}
        onClose={() => setViewer(null)}
        caption={viewer?.item.title}
      />
    </Card>
  );
}

function Entry({ c, onOpen }: { c: PublicCredential; onOpen: (i: number) => void }) {
  const period = periodLabel(c) || (c.year_end === null && c.year ? `с ${c.year}` : "");
  const meta = [
    c.issuer,
    c.supervisor && `супервизор ${c.supervisor}`,
    c.hours && `${c.hours} ${plural(c.hours, "час", "часа", "часов")}`,
    c.number_masked,
  ].filter(Boolean);
  return (
    <li className={s.entry}>
      <div className={s.entryTop}>
        {period && <span className={s.entryYear}>{period}</span>}
        <span className={s.ok}>
          <Check size={13} strokeWidth={2.4} aria-hidden /> Проверено
        </span>
      </div>
      <div className={s.entryTitle}>{c.title}</div>
      {(meta.length > 0 || c.url || c.doi) && (
        <div className={s.entryMeta}>
          {meta.join(", ")}
          {c.doi && (
            <>
              {meta.length ? ". " : ""}
              <a href={`https://doi.org/${c.doi}`} target="_blank" rel="noopener noreferrer nofollow">
                DOI {c.doi}
              </a>
            </>
          )}
          {c.url && !c.doi && (
            <>
              {meta.length ? ". " : ""}
              <a href={c.url} target="_blank" rel="noopener noreferrer nofollow">
                {c.kind === "publication" ? "Читать" : "Ссылка"}
              </a>
            </>
          )}
        </div>
      )}
      {c.files.length > 0 && (
        <div className={s.tiles}>
          {c.files.map((f, i) => (
            <DocTile key={f.id} file={f} onOpen={() => onOpen(i)} label={`Открыть документ: ${c.title}`} />
          ))}
        </div>
      )}
    </li>
  );
}
