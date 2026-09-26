"use client";

import { useRef, useState } from "react";
import { Bold, Eye, Heading2, Italic, Link2, List, ListOrdered, Quote, Trash2 } from "lucide-react";
import { Badge, Button, Card, Input, Segmented, Textarea, useToast } from "@/ui";
import { ApiError } from "@/lib/api/client";
import { contentAdminApi, slugify, TOPICS, type ArticleDraft, type Cover, type EvidenceLevel, type KeyFact, type Source } from "@/lib/api/content";
import { cleanFacts, cleanSources, EvidenceFields } from "./EvidenceFields";
import { ArticleCard } from "../Cards";
import { Markdown } from "../Markdown";
import { CoverPicker, fieldError, Select, Switch } from "./fields";
import s from "./cms.module.css";

type Form = {
  title: string;
  slug: string;
  summary: string;
  body: string;
  topic: string;
  tags: string;
  cover: Cover;
  emoji: string;
  reading_minutes: number;
  author_name: string;
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
    body: a?.body ?? "",
    topic: a?.topic ?? "therapy",
    tags: (a?.tags ?? []).join(", "),
    cover: a?.cover ?? "sky",
    emoji: a?.emoji ?? "",
    reading_minutes: a?.reading_minutes ?? 5,
    author_name: a?.author_name ?? "Редакция aprosop",
    is_published: a?.is_published ?? false,
    evidence_level: a?.evidence_level ?? "",
    when_to_seek_help: a?.when_to_seek_help ?? "",
    sources: a?.sources ?? [],
    key_facts: a?.key_facts ?? [],
  };
}

export function estimateMinutes(text: string) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 160));
}

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
  const [slugTouched, setSlugTouched] = useState(!!article);
  const [mode, setMode] = useState<"split" | "write" | "preview">("split");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const dirty = JSON.stringify(f) !== JSON.stringify(toForm(article));

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));

  const onTitle = (title: string) => {
    setF((x) => ({ ...x, title, slug: slugTouched ? x.slug : slugify(title) }));
  };

  /** Wrap the selection (or insert at the cursor) with Markdown syntax. */
  const format = (kind: "h2" | "b" | "i" | "ul" | "ol" | "quote" | "link") => {
    const el = bodyRef.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b, value } = el;
    const sel = value.slice(a, b);
    const lineStart = value.lastIndexOf("\n", a - 1) + 1;
    let next = value;
    let cursor = b;
    const prefixLines = (p: (i: number) => string) => {
      const block = value.slice(lineStart, b) || "";
      const lines = (block || "Текст").split("\n").map((l, i) => p(i) + l.replace(/^(#{1,3}\s|[-*]\s|\d+\.\s|>\s?)/, ""));
      next = value.slice(0, lineStart) + lines.join("\n") + value.slice(b);
      cursor = lineStart + lines.join("\n").length;
    };
    const wrap = (l: string, r: string, placeholder: string) => {
      const inner = sel || placeholder;
      next = value.slice(0, a) + l + inner + r + value.slice(b);
      cursor = a + l.length + inner.length + r.length;
    };
    if (kind === "h2") prefixLines(() => "## ");
    if (kind === "ul") prefixLines(() => "- ");
    if (kind === "ol") prefixLines((i) => `${i + 1}. `);
    if (kind === "quote") prefixLines(() => "> ");
    if (kind === "b") wrap("**", "**", "важное");
    if (kind === "i") wrap("*", "*", "акцент");
    if (kind === "link") wrap("[", "](https://)", sel || "текст ссылки");
    set("body", next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(cursor, cursor);
    });
  };

  const save = async (publish?: boolean) => {
    setBusy(true);
    setErrors({});
    const body: Partial<ArticleDraft> = {
      title: f.title.trim(),
      slug: f.slug.trim(),
      summary: f.summary.trim(),
      body: f.body,
      topic: f.topic,
      tags: f.tags.split(",").map((t) => t.trim()).filter(Boolean),
      cover: f.cover,
      emoji: f.emoji.trim(),
      reading_minutes: Number(f.reading_minutes) || estimateMinutes(f.body),
      author_name: f.author_name.trim(),
      is_published: publish ?? f.is_published,
      evidence_level: f.evidence_level,
      when_to_seek_help: f.when_to_seek_help,
      sources: cleanSources(f.sources),
      key_facts: cleanFacts(f.key_facts),
    };
    try {
      const saved = article
        ? await contentAdminApi.updateArticle(article.id, body)
        : await contentAdminApi.createArticle(body);
      setF(toForm(saved));
      toast(publish === true ? "Статья опубликована" : publish === false ? "Статья снята с публикации" : "Изменения сохранены");
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
    if (!article) return;
    setBusy(true);
    try {
      await contentAdminApi.deleteArticle(article.id);
      toast("Статья удалена");
      onDeleted();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Не получилось удалить", { error: true });
      setBusy(false);
    }
  };

  const err = (k: string) => fieldError(errors, k);
  const previewCard = {
    id: 0,
    slug: f.slug || "preview",
    title: f.title || "Заголовок статьи",
    summary: f.summary,
    topic: f.topic,
    topic_label: TOPICS.find((t) => t.value === f.topic)?.label ?? "",
    tags: [],
    cover: f.cover,
    emoji: f.emoji,
    reading_minutes: Number(f.reading_minutes) || 1,
    author_name: f.author_name,
    published_at: null,
  };

  return (
    <div className={s.editor}>
      <div className={s.main}>
        <Card as="section">
          <div className={s.grid}>
            <Input label="Заголовок" value={f.title} onChange={(e) => onTitle(e.target.value)} error={err("title")} placeholder="Например: Как справиться с тревогой" />
            <Input
              label="Адрес"
              value={f.slug}
              onChange={(e) => {
                setSlugTouched(true);
                set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"));
              }}
              error={err("slug")}
              hint={`/articles/${f.slug || "…"}`}
            />
            <div className={s.full}>
              <Textarea
                label="Короткое описание"
                value={f.summary}
                onChange={(e) => set("summary", e.target.value)}
                error={err("summary")}
                rows={2}
                maxLength={400}
                hint="Показывается в карточке и под заголовком, до 400 знаков"
              />
            </div>
            <Select label="Тема" value={f.topic} onChange={(v) => set("topic", v)} options={TOPICS} error={err("topic")} />
            <Input label="Теги" value={f.tags} onChange={(e) => set("tags", e.target.value)} error={err("tags")} hint="Через запятую" />
            <CoverPicker value={f.cover} onChange={(v) => set("cover", v)} error={err("cover")} />
            <div className={s.pair}>
              <Input label="Эмодзи" value={f.emoji} onChange={(e) => set("emoji", e.target.value)} maxLength={8} error={err("emoji")} />
              <Input
                label="Минут чтения"
                type="number"
                min={1}
                max={90}
                value={f.reading_minutes}
                onChange={(e) => set("reading_minutes", Number(e.target.value))}
                error={err("reading_minutes")}
              />
            </div>
          </div>
        </Card>

        <Card as="section" className={s.bodyCard}>
          <div className={s.toolbar}>
            <div className={s.tools} role="toolbar" aria-label="Форматирование">
              <ToolBtn label="Подзаголовок" onClick={() => format("h2")} icon={<Heading2 size={18} />} />
              <ToolBtn label="Жирный" onClick={() => format("b")} icon={<Bold size={18} />} />
              <ToolBtn label="Курсив" onClick={() => format("i")} icon={<Italic size={18} />} />
              <ToolBtn label="Список" onClick={() => format("ul")} icon={<List size={18} />} />
              <ToolBtn label="Нумерованный список" onClick={() => format("ol")} icon={<ListOrdered size={18} />} />
              <ToolBtn label="Врезка" onClick={() => format("quote")} icon={<Quote size={18} />} />
              <ToolBtn label="Ссылка" onClick={() => format("link")} icon={<Link2 size={18} />} />
            </div>
            <Segmented
              value={mode}
              onChange={setMode}
              ariaLabel="Режим редактора"
              options={[
                { value: "write", label: "Текст" },
                { value: "split", label: "Рядом" },
                { value: "preview", label: "Просмотр" },
              ]}
            />
          </div>
          <div className={s.bodyPanes} data-mode={mode}>
            {mode !== "preview" && (
              <div className={s.pane}>
                <textarea
                  ref={bodyRef}
                  className={s.bodyInput}
                  value={f.body}
                  onChange={(e) => set("body", e.target.value)}
                  aria-label="Текст статьи в Markdown"
                  placeholder={"Текст статьи.\n\n## Подзаголовок\n\n- пункт списка\n\n**жирный**, *курсив*, [ссылка](https://…)"}
                  spellCheck
                />
                {err("body") && <div className={s.error}>{err("body")}</div>}
              </div>
            )}
            {mode !== "write" && (
              <div className={`${s.pane} ${s.preview}`} aria-label="Предпросмотр">
                {f.body.trim() ? <Markdown source={f.body} /> : <p className={s.muted}>Здесь появится предпросмотр.</p>}
              </div>
            )}
          </div>
          <div className={s.bodyFoot}>
            <span>Markdown: ## подзаголовок, - список, **жирный**, &gt; врезка</span>
            <button type="button" className={s.linkBtn} onClick={() => set("reading_minutes", estimateMinutes(f.body))}>
              Посчитать время чтения ({estimateMinutes(f.body)} мин)
            </button>
          </div>
        </Card>
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
            onChange={(e) => set("when_to_seek_help", e.target.value)}
            error={err("when_to_seek_help")}
            rows={5}
            hint="Markdown-список признаков. Строка про 112 добавляется автоматически."
          />
        </EvidenceFields>
      </div>

      <aside className={s.side}>
        <Card as="section">
          <div className={s.status}>
            <span>Статус</span>
            {article?.is_published ? <Badge tone="success">Опубликована</Badge> : <Badge>Черновик</Badge>}
            {dirty && <Badge tone="warning">Есть изменения</Badge>}
          </div>
          <Input label="Автор" value={f.author_name} onChange={(e) => set("author_name", e.target.value)} error={err("author_name")} />
          <div className={s.actions}>
            {article?.is_published ? (
              <>
                <Button variant="primary" block loading={busy} onClick={() => save()} disabled={!dirty}>
                  Сохранить
                </Button>
                <Button variant="secondary" block disabled={busy} onClick={() => save(false)}>
                  Снять с публикации
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
            {article?.is_published && (
              <Button variant="ghost" block href={`/articles/${article.slug}`} icon={<Eye size={18} strokeWidth={1.8} />}>
                Открыть на сайте
              </Button>
            )}
          </div>
        </Card>
        <div className={s.cardPreview}>
          <span className={s.sideLabel}>Так выглядит карточка</span>
          <ArticleCard a={previewCard} />
        </div>
        {article && (
          <div className={s.danger}>
            {confirmDelete ? (
              <>
                <span>Удалить статью навсегда?</span>
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
                Удалить статью
              </Button>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}

export function ToolBtn({ label, onClick, icon }: { label: string; onClick: () => void; icon: React.ReactNode }) {
  return (
    <button type="button" className={s.tool} aria-label={label} title={label} onClick={onClick}>
      {icon}
    </button>
  );
}
