"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, Trash2 } from "lucide-react";
import { Badge, Button, Input, NumberInput, Segmented, Textarea, useToast } from "@/ui";
import { ApiError } from "@/lib/api/client";
import { contentAdminApi, slugify, topicLabel, type ArticleDraft, type Cover, type EvidenceLevel, type KeyFact, type Source } from "@/lib/api/content";
import { cleanFacts, cleanSources, EvidenceFields } from "./EvidenceFields";
import { ArticleCard } from "../Cards";
import { CoverUploader } from "@/components/media/CoverUploader";
import type { CoverImage } from "@/lib/api/authoring";
import { RichEditor } from "../editor/RichEditor";
import { ArticlePreview, TitleField, TopicPicker, useLocalDraft, wordsLabel } from "../editor/parts";
import { CoverPicker, fieldError } from "./fields";
import e from "../editor/editor.module.css";
import s from "./cms.module.css";

type Form = {
  title: string;
  slug: string;
  summary: string;
  content: string;
  topics: string[];
  tags: string;
  cover: Cover;
  cover_image: CoverImage | null;
  emoji: string;
  reading_minutes: number;
  /** true → minutes follow the word count */
  auto_minutes: boolean;
  author_name: string;
  /** YYYY-MM-DD in the editor's local time; "" = set on publish */
  published_date: string;
  is_published: boolean;
  evidence_level: EvidenceLevel;
  when_to_seek_help: string;
  sources: Source[];
  key_facts: KeyFact[];
};

function toForm(a: ArticleDraft | null): Form {
  return {
    title: a?.title ?? "",
    slug: a?.slug ?? "",
    summary: a?.summary ?? "",
    content: a?.content ?? "",
    topics: a?.topics?.length ? a.topics : a?.topic ? [a.topic] : [],
    tags: (a?.tags ?? []).join(", "),
    cover: a?.cover ?? "sky",
    cover_image: a?.cover_image ?? null,
    emoji: a?.emoji ?? "",
    reading_minutes: a?.reading_minutes ?? 5,
    auto_minutes: !a,
    // New article: empty → the API fills in the editor's name (or «Редакция Aprosop»).
    author_name: a?.author_name ?? "",
    published_date: localDate(a?.published_at ?? null),
    is_published: a?.is_published ?? false,
    evidence_level: a?.evidence_level ?? "",
    when_to_seek_help: a?.when_to_seek_help ?? "",
    sources: a?.sources ?? [],
    key_facts: a?.key_facts ?? [],
  };
}

function localDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function estimateMinutes(words: number) {
  return Math.max(1, Math.round(words / 160));
}

const AUTOSAVE_MS = 3000;

/** Staff CMS article editor: same writing surface as specialists, plus editorial fields. */
export function ArticleEditor({
  article,
  onSaved,
  onDeleted,
}: {
  article: ArticleDraft | null;
  onSaved: (a: ArticleDraft) => void;
  onDeleted: () => void;
}) {
  const toast = useToast();
  const [f, setF] = useState<Form>(() => toForm(article));
  const [base, setBase] = useState<Form>(() => toForm(article));
  const [slugTouched, setSlugTouched] = useState(!!article);
  const [busy, setBusy] = useState(false);
  const [autosaving, setAutosaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [mode, setMode] = useState<"write" | "preview">("write");
  const [words, setWords] = useState(0);
  const dirty = JSON.stringify(f) !== JSON.stringify(base);
  const local = useLocalDraft(`aprosop:article-draft:cms:${article?.id ?? "new"}`, f.title, f.content, article?.updated_at ?? null);
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const onTitle = (title: string) => setF((x) => ({ ...x, title, slug: slugTouched ? x.slug : slugify(title) }));
  const minutes = f.auto_minutes ? estimateMinutes(words) : Number(f.reading_minutes) || 1;

  const payload = (form: Form, publish?: boolean): Partial<ArticleDraft> => ({
    title: form.title.trim(),
    slug: form.slug.trim(),
    summary: form.summary.trim(),
    content: form.content,
    ...(form.topics.length ? { topics: form.topics } : {}),
    tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
    cover: form.cover,
    // Only send the cover when it changed (id, or null to remove)
    ...((form.cover_image?.id ?? null) !== (article?.cover_image?.id ?? null) ? { cover_image_id: form.cover_image?.id ?? null } : {}),
    emoji: form.emoji.trim(),
    reading_minutes: form.auto_minutes ? estimateMinutes(words) : Number(form.reading_minutes) || 1,
    author_name: form.author_name.trim(),
    is_published: publish ?? form.is_published,
    // Only send the date when the editor changed it, so the original publish time is kept.
    ...(form.published_date !== localDate(article?.published_at ?? null)
      ? { published_at: form.published_date ? new Date(`${form.published_date}T12:00:00`).toISOString() : null }
      : {}),
    evidence_level: form.evidence_level,
    when_to_seek_help: form.when_to_seek_help,
    sources: cleanSources(form.sources),
    key_facts: cleanFacts(form.key_facts),
  });

  const save = async (publish?: boolean) => {
    setBusy(true);
    setErrors({});
    const form = f;
    try {
      const saved = article
        ? await contentAdminApi.updateArticle(article.id, payload(form, publish))
        : await contentAdminApi.createArticle(payload(form, publish));
      const next = { ...toForm(saved), auto_minutes: form.auto_minutes };
      setF(next);
      setBase(next);
      local.clear();
      toast(publish === true ? "Статья опубликована" : publish === false ? "Статья снята с публикации" : "Изменения сохранены");
      onSaved(saved);
    } catch (x) {
      if (x instanceof ApiError) {
        setErrors(x.fields);
        toast(x.message, { error: true });
      } else toast("Не получилось сохранить. Попробуйте ещё раз.", { error: true });
    } finally {
      setBusy(false);
    }
  };

  // Unpublished drafts save themselves; published articles change only on «Сохранить»
  const canAutosave = !!article && !article.is_published && dirty && !busy;
  useEffect(() => {
    if (!canAutosave || !article) return;
    const form = f;
    const t = window.setTimeout(() => {
      setAutosaving(true);
      contentAdminApi
        .updateArticle(article.id, payload(form))
        .then((saved) => {
          setBase(form);
          onSavedRef.current(saved);
        })
        .catch((x) => x instanceof ApiError && setErrors(x.fields))
        .finally(() => setAutosaving(false));
    }, AUTOSAVE_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f, canAutosave]);

  const remove = async () => {
    if (!article) return;
    setBusy(true);
    try {
      await contentAdminApi.deleteArticle(article.id);
      local.clear();
      toast("Статья удалена");
      onDeleted();
    } catch (x) {
      toast(x instanceof ApiError ? x.message : "Не получилось удалить", { error: true });
      setBusy(false);
    }
  };

  const err = (k: string) => fieldError(errors, k);
  const previewCard = {
    id: 0,
    slug: f.slug || "preview",
    title: f.title || "Заголовок статьи",
    summary: f.summary,
    topic: f.topics[0] ?? "therapy",
    topic_label: topicLabel(f.topics[0] ?? "therapy"),
    topics: f.topics,
    tags: [],
    cover: f.cover,
    cover_image: f.cover_image,
    emoji: f.emoji,
    reading_minutes: minutes,
    author_name: f.author_name,
    published_at: f.published_date ? new Date(`${f.published_date}T12:00:00`).toISOString() : null,
  };

  return (
    <div className={e.page}>
      <div className={e.bar}>
        <div className={e.barInfo}>
          {article?.is_published ? <Badge tone="success">Опубликована</Badge> : <Badge>Черновик</Badge>}
          {autosaving ? (
            <span className={e.saveState} data-state="saving">
              Сохраняю…
            </span>
          ) : dirty ? (
            <span className={e.saveState} data-state="dirty">
              Есть изменения
            </span>
          ) : article ? (
            <span className={e.saveState}>Сохранено</span>
          ) : null}
          <span>
            {wordsLabel(words)}
            {words > 0 && ` · ${minutes} мин`}
          </span>
        </div>
        <div className={e.barActions}>
          <Segmented
            value={mode}
            onChange={setMode}
            ariaLabel="Режим"
            options={[
              { value: "write", label: "Текст" },
              { value: "preview", label: "Просмотр" },
            ]}
          />
          {article?.is_published ? (
            <>
              <Button variant="primary" size="sm" loading={busy} onClick={() => save()} disabled={!dirty}>
                Сохранить
              </Button>
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => save(false)}>
                Снять
              </Button>
              <Button variant="ghost" size="sm" href={`/articles/${article.slug}`} icon={<Eye size={16} strokeWidth={1.8} />}>
                На&nbsp;сайте
              </Button>
            </>
          ) : (
            <>
              {!article && (
                <Button variant="secondary" size="sm" disabled={busy} onClick={() => save(false)}>
                  Сохранить черновик
                </Button>
              )}
              <Button variant="primary" size="sm" loading={busy} onClick={() => save(true)}>
                Опубликовать
              </Button>
            </>
          )}
        </div>
      </div>

      {local.restore && (
        <div className={e.notice}>
          <span>На&nbsp;этом устройстве есть более новая версия текста.</span>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setF((x) => ({ ...x, title: local.restore!.title, content: local.restore!.content }));
              local.dismiss();
            }}
          >
            Восстановить
          </Button>
          <Button size="sm" variant="ghost" onClick={local.dismiss}>
            Не&nbsp;нужно
          </Button>
        </div>
      )}

      <div className={e.column} data-writing>
        {mode === "write" ? (
          <>
            <TitleField value={f.title} onChange={onTitle} error={err("title")} />
            <RichEditor value={f.content} onChange={(v) => set("content", v)} onWords={setWords} onError={(m) => toast(m, { error: true })} />
            {err("content") && <div className={e.fieldError}>{err("content")}</div>}
          </>
        ) : (
          <ArticlePreview a={previewCard} content={f.content} sources={cleanSources(f.sources)} />
        )}
      </div>

      <section className={e.details} aria-label="Для ленты">
        <h2 className={e.detailsTitle}>Для&nbsp;ленты</h2>
        <div className={e.detailsGrid}>
          <div className={e.detailsMain}>
            <Textarea
              label="Короткое описание"
              value={f.summary}
              onChange={(ev) => set("summary", ev.target.value)}
              error={err("summary")}
              rows={2}
              maxLength={400}
              hint="В&nbsp;карточке и&nbsp;под&nbsp;заголовком, до&nbsp;400&nbsp;знаков"
            />
            <TopicPicker value={f.topics} onChange={(v) => set("topics", v)} error={err("topics") ?? err("topic")} />
            <div className={s.grid}>
              <Input
                label="Адрес"
                value={f.slug}
                onChange={(ev) => {
                  setSlugTouched(true);
                  set("slug", ev.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"));
                }}
                error={err("slug")}
                hint={`/articles/${f.slug || "…"}`}
              />
              <Input label="Теги" value={f.tags} onChange={(ev) => set("tags", ev.target.value)} error={err("tags")} hint="Через запятую" />
              <CoverPicker value={f.cover} onChange={(v) => set("cover", v)} error={err("cover")} />
              <div className={s.pair}>
                <Input label="Эмодзи" value={f.emoji} onChange={(ev) => set("emoji", ev.target.value)} maxLength={8} error={err("emoji")} />
                <NumberInput
                  label="Минут чтения"
                  min={1}
                  max={90}
                  value={minutes}
                  onChange={(v) => setF((x) => ({ ...x, auto_minutes: false, reading_minutes: v ?? 1 }))}
                  error={err("reading_minutes")}
                  hint={f.auto_minutes ? "По числу слов" : undefined}
                />
              </div>
            </div>
            <CoverUploader value={f.cover_image} onChange={(v) => set("cover_image", v)} error={err("cover_image_id")} />
          </div>
          <div className={e.detailsSide}>
            <span className={e.sideLabel}>Так выглядит карточка</span>
            <ArticleCard a={previewCard} />
            <Input
              label="Редактор"
              value={f.author_name}
              onChange={(ev) => set("author_name", ev.target.value)}
              error={err("author_name")}
              placeholder="Ваше имя"
              hint={article ? undefined : "Пусто — подставим ваше имя"}
            />
            <Input
              label="Дата публикации"
              type="date"
              value={f.published_date}
              onChange={(ev) => set("published_date", ev.target.value)}
              error={err("published_at")}
              hint={f.published_date ? undefined : "Поставим при публикации"}
            />
          </div>
        </div>

        <EvidenceFields
          level={f.evidence_level}
          onLevel={(v) => set("evidence_level", v)}
          sources={f.sources}
          onSources={(v) => set("sources", v)}
          facts={f.key_facts}
          onFacts={(v) => set("key_facts", v)}
          errors={err}
        >
          <Textarea
            label="Когда нужен специалист"
            value={f.when_to_seek_help}
            onChange={(ev) => set("when_to_seek_help", ev.target.value)}
            error={err("when_to_seek_help")}
            rows={5}
            hint="Список признаков: каждая строка с&nbsp;«- ». Строка про&nbsp;112&nbsp;добавляется автоматически."
          />
        </EvidenceFields>

        {article && (
          <div>
            {confirmDelete ? (
              <div className={e.notice}>
                <span>Удалить статью навсегда?</span>
                <Button variant="danger" size="sm" loading={busy} onClick={remove}>
                  Удалить
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                  Отмена
                </Button>
              </div>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)} icon={<Trash2 size={16} strokeWidth={1.8} />}>
                Удалить статью
              </Button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
