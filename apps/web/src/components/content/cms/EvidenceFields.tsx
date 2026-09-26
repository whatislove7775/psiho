"use client";

import { Plus, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { Button, Card, CardHead, Input } from "@/ui";
import { EVIDENCE_LEVELS, type EvidenceLevel, type KeyFact, type Source } from "@/lib/api/content";
import { Select } from "./fields";
import s from "./cms.module.css";
import e from "./evidenceFields.module.css";

const LEVEL_OPTIONS = [
  { value: "", label: "Не указан" },
  ...EVIDENCE_LEVELS.map((l) => ({ value: l.value, label: l.label })),
];

const EMPTY_SOURCE: Source = { title: "", url: "", authors: "", publisher: "" };

/**
 * «Доказательность» card of the CMS editors: evidence badge, verified sources, key facts.
 * Texts refer to sources with markers like [1] or [1, 2] (1-based positions in the list).
 */
export function EvidenceFields({
  level,
  onLevel,
  sources,
  onSources,
  facts,
  onFacts,
  errors,
  children,
}: {
  level: EvidenceLevel;
  onLevel: (v: EvidenceLevel) => void;
  sources: Source[];
  onSources: (v: Source[]) => void;
  facts?: KeyFact[];
  onFacts?: (v: KeyFact[]) => void;
  errors: (k: string) => string | undefined;
  /** Extra text fields (when to seek help / mechanism / cautions). */
  children?: ReactNode;
}) {
  const setSource = (i: number, patch: Partial<Source>) =>
    onSources(sources.map((src, j) => (j === i ? { ...src, ...patch } : src)));
  const setFact = (i: number, patch: Partial<KeyFact>) =>
    facts && onFacts?.(facts.map((f, j) => (j === i ? { ...f, ...patch } : f)));

  return (
    <Card as="section">
      <CardHead
        title="Доказательность"
        sub="Ссылайтесь в тексте на источники как [1] или [1, 2]. Добавляйте только то, что вы открыли и проверили: название, авторы и год должны совпадать с записью по ссылке."
      />
      <div className={e.stack}>
        <Select
          label="Сила доказательств"
          value={level}
          onChange={(v) => onLevel(v as EvidenceLevel)}
          options={LEVEL_OPTIONS}
          error={errors("evidence_level")}
        />
        {children}

        {facts && onFacts && (
          <fieldset className={e.group}>
            <legend>Главное из исследований</legend>
            {facts.map((f, i) => (
              <div key={i} className={e.factRow}>
                <Input
                  label={`Факт ${i + 1}`}
                  value={f.text}
                  onChange={(ev) => setFact(i, { text: ev.target.value })}
                  maxLength={600}
                />
                <Input
                  label="Источники"
                  value={f.refs.join(", ")}
                  inputMode="numeric"
                  placeholder="1, 2"
                  onChange={(ev) =>
                    setFact(i, {
                      refs: ev.target.value
                        .split(/[^\d]+/)
                        .filter(Boolean)
                        .map((n) => parseInt(n, 10)),
                    })
                  }
                />
                <button
                  type="button"
                  className={s.tool}
                  aria-label={`Удалить факт ${i + 1}`}
                  onClick={() => onFacts(facts.filter((_, j) => j !== i))}
                >
                  <Trash2 size={16} strokeWidth={1.8} />
                </button>
              </div>
            ))}
            {errors("key_facts") && <div className={s.error}>{errors("key_facts")}</div>}
            <Button
              size="sm"
              variant="ghost"
              icon={<Plus size={16} strokeWidth={1.9} />}
              onClick={() => onFacts([...facts, { text: "", refs: [] }])}
              disabled={facts.length >= 12}
            >
              Добавить факт
            </Button>
          </fieldset>
        )}

        <fieldset className={e.group}>
          <legend>Источники</legend>
          {sources.map((src, i) => (
            <div key={i} className={e.source}>
              <div className={e.sourceTop}>
                <span className={e.num}>{i + 1}</span>
                <button
                  type="button"
                  className={s.tool}
                  aria-label={`Удалить источник ${i + 1}`}
                  onClick={() => onSources(sources.filter((_, j) => j !== i))}
                >
                  <Trash2 size={16} strokeWidth={1.8} />
                </button>
              </div>
              <Input label="Название" value={src.title} onChange={(ev) => setSource(i, { title: ev.target.value })} />
              <Input
                label="Ссылка"
                type="url"
                value={src.url}
                placeholder="https://pubmed.ncbi.nlm.nih.gov/…"
                onChange={(ev) => setSource(i, { url: ev.target.value })}
              />
              <div className={e.sourceGrid}>
                <Input label="Авторы" value={src.authors ?? ""} onChange={(ev) => setSource(i, { authors: ev.target.value })} />
                <Input
                  label="Год"
                  inputMode="numeric"
                  value={src.year ? String(src.year) : ""}
                  onChange={(ev) => setSource(i, { year: parseInt(ev.target.value, 10) || undefined })}
                />
                <Input
                  label="Журнал или организация"
                  value={src.publisher ?? ""}
                  onChange={(ev) => setSource(i, { publisher: ev.target.value })}
                />
                <Input label="DOI" value={src.doi ?? ""} placeholder="10.…" onChange={(ev) => setSource(i, { doi: ev.target.value })} />
              </div>
            </div>
          ))}
          {errors("sources") && <div className={s.error}>{errors("sources")}</div>}
          <Button
            size="sm"
            variant="ghost"
            icon={<Plus size={16} strokeWidth={1.9} />}
            onClick={() => onSources([...sources, { ...EMPTY_SOURCE }])}
            disabled={sources.length >= 30}
          >
            Добавить источник
          </Button>
        </fieldset>
      </div>
    </Card>
  );
}

/** Drop empty rows and optional blanks before saving. */
export function cleanSources(list: Source[]): Source[] {
  return list
    .filter((x) => x.title.trim() || x.url.trim())
    .map((x) => {
      const out: Source = { title: x.title.trim(), url: x.url.trim() };
      if (x.authors?.trim()) out.authors = x.authors.trim();
      if (x.publisher?.trim()) out.publisher = x.publisher.trim();
      if (x.doi?.trim()) out.doi = x.doi.trim();
      if (x.year) out.year = x.year;
      if (x.kind) out.kind = x.kind;
      return out;
    });
}

export function cleanFacts(list: KeyFact[]): KeyFact[] {
  return list.filter((f) => f.text.trim()).map((f) => ({ text: f.text.trim(), refs: f.refs }));
}
