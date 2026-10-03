"use client";

import { t } from "@/lib/i18n";
import { Plus, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { Button, Card, CardHead, Input } from "@/ui";
import { EVIDENCE_LEVELS, type EvidenceLevel, type KeyFact, type Source } from "@/lib/api/content";
import { Select } from "./fields";
import s from "./cms.module.css";
import e from "./evidenceFields.module.css";

const LEVEL_OPTIONS = [
  { value: "", get label() { return t("Не\u00a0указан"); } },
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
  title = t("Доказательность"),
  sub = t("Ссылайтесь в\u00a0тексте на\u00a0источники как\u00a0[1] или\u00a0[1, 2]. Добавляйте только то, что\u00a0вы\u00a0открыли и\u00a0проверили: название, авторы и\u00a0год должны совпадать с\u00a0записью по\u00a0ссылке."),
}: {
  /** Without onLevel the evidence level select is hidden (specialist editor: sources only). */
  level?: EvidenceLevel;
  onLevel?: (v: EvidenceLevel) => void;
  title?: string;
  sub?: string;
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
      <CardHead title={title} sub={sub} />
      <div className={e.stack}>
        {onLevel && (
          <Select
            label={t("Сила доказательств")}
            value={level ?? ""}
            onChange={(v) => onLevel(v as EvidenceLevel)}
            options={LEVEL_OPTIONS}
            error={errors("evidence_level")}
          />
        )}
        {children}

        {facts && onFacts && (
          <fieldset className={e.group}>
            <legend>{t("Главное из\u00a0исследований")}</legend>
            {facts.map((f, i) => (
              <div key={i} className={e.factRow}>
                <Input
                  label={t(`Факт {v}`, { v: i + 1 })}
                  value={f.text}
                  onChange={(ev) => setFact(i, { text: ev.target.value })}
                  maxLength={600}
                />
                <Input
                  label={t("Источники")}
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
                  aria-label={t(`Удалить факт {v}`, { v: i + 1 })}
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
              {t("Добавить факт")}
            </Button>
          </fieldset>
        )}

        <fieldset className={e.group}>
          <legend>{t("Источники")}</legend>
          {sources.map((src, i) => (
            <div key={i} className={e.source}>
              <div className={e.sourceTop}>
                <span className={e.num}>{i + 1}</span>
                <button
                  type="button"
                  className={s.tool}
                  aria-label={t(`Удалить источник {v}`, { v: i + 1 })}
                  onClick={() => onSources(sources.filter((_, j) => j !== i))}
                >
                  <Trash2 size={16} strokeWidth={1.8} />
                </button>
              </div>
              <Input label={t("Название")} value={src.title} onChange={(ev) => setSource(i, { title: ev.target.value })} />
              <Input
                label={t("Ссылка")}
                type="url"
                value={src.url}
                placeholder="https://pubmed.ncbi.nlm.nih.gov/…"
                onChange={(ev) => setSource(i, { url: ev.target.value })}
              />
              <div className={e.sourceGrid}>
                <Input label={t("Авторы")} value={src.authors ?? ""} onChange={(ev) => setSource(i, { authors: ev.target.value })} />
                <Input
                  label={t("Год")}
                  inputMode="numeric"
                  value={src.year ? String(src.year) : ""}
                  onChange={(ev) => setSource(i, { year: parseInt(ev.target.value, 10) || undefined })}
                />
                <Input
                  label={t("Журнал или\u00a0организация")}
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
            {t("Добавить источник")}
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
