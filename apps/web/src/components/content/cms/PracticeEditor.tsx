"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Eye, Plus, Trash2, X } from "lucide-react";
import { Badge, Button, Card, CardHead, Input, Textarea, useToast } from "@/ui";
import { ApiError } from "@/lib/api/client";
import {
  contentAdminApi,
  PRACTICE_KINDS,
  slugify,
  type BreathPattern,
  type Cover,
  type EvidenceLevel,
  type Source,
  type PracticeDraft,
  type PracticeKind,
  type PracticeStep,
} from "@/lib/api/content";
import { PracticeCard } from "../Cards";
import { cleanSources, EvidenceFields } from "./EvidenceFields";
import { CoverPicker, fieldError, Select, Switch } from "./fields";
import s from "./cms.module.css";

type Form = {
  title: string;
  slug: string;
  summary: string;
  kind: PracticeKind;
  duration_minutes: number;
  cover: Cover;
  emoji: string;
  order: number;
  is_published: boolean;
  steps: (PracticeStep & { key: number })[];
  pattern: BreathPattern | null;
  evidence_level: EvidenceLevel;
  mechanism: string;
  cautions: string;
  sources: Source[];
};

let keySeq = 1;
const DEFAULT_PATTERN: BreathPattern = { inhale: 4, hold: 0, exhale: 6, hold_after: 0, cycles: 8 };

function toForm(p: PracticeDraft | null): Form {
  return {
    title: p?.title ?? "",
    slug: p?.slug ?? "",
    summary: p?.summary ?? "",
    kind: p?.kind ?? "mindfulness",
    duration_minutes: p?.duration_minutes ?? 5,
    cover: p?.cover ?? "mint",
    emoji: p?.emoji ?? "",
    order: p?.order ?? 100,
    is_published: p?.is_published ?? false,
    steps: (p?.steps ?? [{ title: "", text: "" }]).map((st) => ({ ...st, key: keySeq++ })),
    pattern: p?.pattern ?? null,
    evidence_level: p?.evidence_level ?? "",
    mechanism: p?.mechanism ?? "",
    cautions: p?.cautions ?? "",
    sources: p?.sources ?? [],
  };
}

const strip = (f: Form) => ({ ...f, steps: f.steps.map(({ key: _k, ...st }) => st) });

export function PracticeEditor({
  practice,
  onSaved,
  onDeleted,
}: {
  practice: PracticeDraft | null;
  onSaved: (p: PracticeDraft) => void;
  onDeleted: () => void;
}) {
  const toast = useToast();
  const [f, setF] = useState<Form>(() => toForm(practice));
  const [slugTouched, setSlugTouched] = useState(!!practice);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const dirty = JSON.stringify(strip(f)) !== JSON.stringify(strip(toForm(practice)));
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const err = (k: string) => fieldError(errors, k);

  const setStep = (i: number, patch: Partial<PracticeStep>) =>
    setF((x) => ({ ...x, steps: x.steps.map((st, j) => (j === i ? { ...st, ...patch } : st)) }));
  const moveStep = (i: number, d: -1 | 1) =>
    setF((x) => {
      const steps = [...x.steps];
      const j = i + d;
      if (j < 0 || j >= steps.length) return x;
      [steps[i], steps[j]] = [steps[j], steps[i]];
      return { ...x, steps };
    });
  const removeStep = (i: number) => setF((x) => ({ ...x, steps: x.steps.filter((_, j) => j !== i) }));
  const addStep = () => setF((x) => ({ ...x, steps: [...x.steps, { title: "", text: "", key: keySeq++ }] }));
  const setPattern = (k: keyof BreathPattern, v: number) =>
    setF((x) => ({ ...x, pattern: { ...(x.pattern ?? DEFAULT_PATTERN), [k]: v } }));

  const save = async (publish?: boolean) => {
    setBusy(true);
    setErrors({});
    const body: Partial<PracticeDraft> = {
      title: f.title.trim(),
      slug: f.slug.trim(),
      summary: f.summary.trim(),
      kind: f.kind,
      duration_minutes: Number(f.duration_minutes) || 1,
      cover: f.cover,
      emoji: f.emoji.trim(),
      order: Number(f.order) || 100,
      is_published: publish ?? f.is_published,
      steps: f.steps
        .filter((st) => st.text.trim() || st.title.trim())
        .map(({ key: _k, ...st }) => ({ ...st, seconds: st.seconds ? Number(st.seconds) : undefined })),
      pattern: f.pattern,
      evidence_level: f.evidence_level,
      mechanism: f.mechanism,
      cautions: f.cautions,
      sources: cleanSources(f.sources),
    };
    try {
      const saved = practice
        ? await contentAdminApi.updatePractice(practice.id, body)
        : await contentAdminApi.createPractice(body);
      setF(toForm(saved));
      toast(publish === true ? "Практика опубликована" : publish === false ? "Практика сохранена как черновик" : "Изменения сохранены");
      onSaved(saved);
    } catch (e) {
      if (e instanceof ApiError) {
        setErrors(e.fields);
        toast(e.message, { error: true });
      } else toast("Не получилось сохранить. Попробуйте ещё раз.", { error: true });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!practice) return;
    setBusy(true);
    try {
      await contentAdminApi.deletePractice(practice.id);
      toast("Практика удалена");
      onDeleted();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Не получилось удалить", { error: true });
      setBusy(false);
    }
  };

  const pattern = f.pattern ?? DEFAULT_PATTERN;

  return (
    <div className={s.editor}>
      <div className={s.main}>
        <Card as="section">
          <div className={s.grid}>
            <Input
              label="Название"
              value={f.title}
              onChange={(e) => {
                const title = e.target.value;
                setF((x) => ({ ...x, title, slug: slugTouched ? x.slug : slugify(title) }));
              }}
              error={err("title")}
            />
            <Input
              label="Адрес"
              value={f.slug}
              onChange={(e) => {
                setSlugTouched(true);
                set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"));
              }}
              error={err("slug")}
              hint={`/practices/${f.slug || "…"}`}
            />
            <div className={s.full}>
              <Textarea label="Короткое описание" value={f.summary} rows={2} maxLength={400} onChange={(e) => set("summary", e.target.value)} error={err("summary")} />
            </div>
            <Select label="Вид" value={f.kind} onChange={(v) => set("kind", v as PracticeKind)} options={PRACTICE_KINDS} error={err("kind")} />
            <div className={s.pair}>
              <Input label="Минут" type="number" min={1} max={120} value={f.duration_minutes} onChange={(e) => set("duration_minutes", Number(e.target.value))} error={err("duration_minutes")} />
              <Input label="Порядок" type="number" min={0} value={f.order} onChange={(e) => set("order", Number(e.target.value))} hint="Меньше — выше" />
            </div>
            <CoverPicker value={f.cover} onChange={(v) => set("cover", v)} error={err("cover")} />
            <Input label="Эмодзи" value={f.emoji} maxLength={8} onChange={(e) => set("emoji", e.target.value)} error={err("emoji")} />
          </div>
        </Card>

        <Card as="section">
          <Switch
            checked={!!f.pattern}
            onChange={(v) => set("pattern", v ? pattern : null)}
            label="Дыхательный ритм"
            hint="Клиент увидит анимированный круг вместо пошагового режима"
          />
          {f.pattern && (
            <div className={s.pattern}>
              {(
                [
                  ["inhale", "Вдох, сек"],
                  ["hold", "Пауза, сек"],
                  ["exhale", "Выдох, сек"],
                  ["hold_after", "Пауза после, сек"],
                  ["cycles", "Циклов"],
                ] as [keyof BreathPattern, string][]
              ).map(([k, label]) => (
                <Input key={k} label={label} type="number" min={0} max={60} value={pattern[k]} onChange={(e) => setPattern(k, Number(e.target.value))} />
              ))}
            </div>
          )}
          {err("pattern") && <div className={s.error}>{err("pattern")}</div>}
        </Card>

        <Card as="section">
          <CardHead title="Шаги" sub="Коротко и по-человечески. Время необязательно: с ним у шага появится мягкий таймер." />
          <ol className={s.steps}>
            {f.steps.map((st, i) => (
              <li key={st.key} className={s.stepRow}>
                <span className={s.stepNum}>{i + 1}</span>
                <div className={s.stepFields}>
                  <div className={s.stepTop}>
                    <Input aria-label={`Шаг ${i + 1}: заголовок`} placeholder="Заголовок шага" value={st.title} onChange={(e) => setStep(i, { title: e.target.value })} />
                    <Input
                      aria-label={`Шаг ${i + 1}: секунд`}
                      placeholder="Сек"
                      type="number"
                      min={0}
                      max={3600}
                      className={s.seconds}
                      value={st.seconds ?? ""}
                      onChange={(e) => setStep(i, { seconds: e.target.value ? Number(e.target.value) : undefined })}
                    />
                  </div>
                  <Textarea aria-label={`Шаг ${i + 1}: текст`} placeholder="Что делать" rows={2} value={st.text} onChange={(e) => setStep(i, { text: e.target.value })} />
                </div>
                <div className={s.stepBtns}>
                  <IconBtn label="Выше" onClick={() => moveStep(i, -1)} disabled={i === 0} icon={<ArrowUp size={16} />} />
                  <IconBtn label="Ниже" onClick={() => moveStep(i, 1)} disabled={i === f.steps.length - 1} icon={<ArrowDown size={16} />} />
                  <IconBtn label="Удалить шаг" onClick={() => removeStep(i)} icon={<X size={16} />} />
                </div>
              </li>
            ))}
          </ol>
          {err("steps") && <div className={s.error}>{err("steps")}</div>}
          <Button variant="secondary" size="sm" onClick={addStep} icon={<Plus size={16} strokeWidth={2} />}>
            Добавить шаг
          </Button>
        </Card>

        <EvidenceFields
          level={f.evidence_level}
          onLevel={(v) => set("evidence_level", v)}
          sources={f.sources}
          onSources={(v) => set("sources", v)}
          errors={err}
        >
          <Textarea
            label="Почему это может помочь"
            value={f.mechanism}
            onChange={(e) => set("mechanism", e.target.value)}
            error={err("mechanism")}
            rows={4}
            hint="Механизм простыми словами, со ссылками [1] на источники"
          />
          <Textarea
            label="Когда остановиться или пропустить"
            value={f.cautions}
            onChange={(e) => set("cautions", e.target.value)}
            error={err("cautions")}
            rows={4}
            hint="Markdown-список предостережений"
          />
        </EvidenceFields>
      </div>

      <aside className={s.side}>
        <Card as="section">
          <div className={s.status}>
            <span>Статус</span>
            {practice?.is_published ? <Badge tone="success">Опубликована</Badge> : <Badge>Черновик</Badge>}
            {dirty && <Badge tone="warning">Есть изменения</Badge>}
          </div>
          <div className={s.actions}>
            {practice?.is_published ? (
              <>
                <Button variant="primary" block loading={busy} onClick={() => save()} disabled={!dirty}>
                  Сохранить
                </Button>
                <Button variant="secondary" block disabled={busy} onClick={() => save(false)}>
                  Снять с публикации
                </Button>
                <Button variant="ghost" block href={`/practices/${practice.slug}`} icon={<Eye size={18} strokeWidth={1.8} />}>
                  Открыть на сайте
                </Button>
              </>
            ) : (
              <>
                <Button variant="primary" block loading={busy} onClick={() => save(true)}>
                  Опубликовать
                </Button>
                <Button variant="secondary" block disabled={busy} onClick={() => save(false)}>
                  Сохранить черновик
                </Button>
              </>
            )}
          </div>
        </Card>
        <div className={s.cardPreview}>
          <span className={s.sideLabel}>Так выглядит карточка</span>
          <PracticeCard
            p={{
              id: 0,
              slug: f.slug || "preview",
              title: f.title || "Название практики",
              summary: f.summary,
              kind: f.kind,
              kind_label: PRACTICE_KINDS.find((k) => k.value === f.kind)?.label ?? "",
              duration_minutes: Number(f.duration_minutes) || 1,
              cover: f.cover,
              emoji: f.emoji,
            }}
          />
        </div>
        {practice && (
          <div className={s.danger}>
            {confirmDelete ? (
              <>
                <span>Удалить практику навсегда?</span>
                <div className={s.dangerBtns}>
                  <Button variant="danger" size="sm" loading={busy} onClick={remove}>
                    Удалить
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                    Отмена
                  </Button>
                </div>
              </>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)} icon={<Trash2 size={16} strokeWidth={1.8} />}>
                Удалить практику
              </Button>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}

function IconBtn({ label, onClick, icon, disabled }: { label: string; onClick: () => void; icon: React.ReactNode; disabled?: boolean }) {
  return (
    <button type="button" className={s.tool} aria-label={label} title={label} onClick={onClick} disabled={disabled}>
      {icon}
    </button>
  );
}
