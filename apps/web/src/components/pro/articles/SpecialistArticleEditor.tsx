"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Eye, Send, Trash2, Undo2 } from "lucide-react";
import { Badge, Button, Segmented, Textarea, useToast } from "@/ui";
import { ApiError } from "@/lib/api/client";
import { topicLabel, type Cover, type Source } from "@/lib/api/content";
import { myArticlesApi, STATUS_LABEL, type ArticleStatus, type CoverImage, type MyArticle, type MyArticleInput } from "@/lib/api/authoring";
import { cleanSources, EvidenceFields } from "@/components/content/cms/EvidenceFields";
import { fieldError } from "@/components/content/cms/fields";
import { ArticleCard } from "@/components/content/Cards";
import { CoverUploader } from "@/components/media/CoverUploader";
import { RichEditor } from "@/components/content/editor/RichEditor";
import { ArticlePreview, TitleField, TopicPicker, useLocalDraft, wordsLabel } from "@/components/content/editor/parts";
import e from "@/components/content/editor/editor.module.css";
import p from "./articles.module.css";

type Form = { title: string; summary: string; content: string; topics: string[]; sources: Source[]; cover_image: CoverImage | null };

const toForm = (a: MyArticle | null): Form => ({
  title: a?.title ?? "",
  summary: a?.summary ?? "",
  content: a?.content ?? "",
  topics: a?.topics?.length ? a.topics : a?.topic ? [a.topic] : [],
  sources: a?.sources ?? [],
  cover_image: a?.cover_image ?? null,
});

export const STATUS_TONE: Record<ArticleStatus, "neutral" | "warning" | "success" | "danger"> = {
  draft: "neutral",
  pending: "warning",
  approved: "success",
  rejected: "danger",
};

const MIN_WORDS = 150;
const AUTOSAVE_MS = 2500;

/**
 * Specialist-scoped article editor (/pro/articles): a clean writing column (big title + visual text),
 * autosave of drafts, preview identical to the published page; card details (summary, topics, cover,
 * sources) below the text.
 */
export function SpecialistArticleEditor({
  article,
  name,
  photo,
  onSaved,
  onDeleted,
}: {
  article: MyArticle | null;
  name: string;
  photo: string | null;
  onSaved: (a: MyArticle) => void;
  onDeleted: () => void;
}) {
  const toast = useToast();
  const [f, setF] = useState<Form>(() => toForm(article));
  const [base, setBase] = useState<Form>(() => toForm(article));
  const [busy, setBusy] = useState<"submit" | "withdraw" | "delete" | null>(null);
  const [saving, setSaving] = useState<"idle" | "saving" | "error">("idle");
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [mode, setMode] = useState<"write" | "preview">("write");
  const [words, setWords] = useState(0);
  const idRef = useRef<number | null>(article?.id ?? null);
  const inflight = useRef<Promise<MyArticle> | null>(null);
  const status: ArticleStatus = article?.status ?? "draft";
  const locked = status === "pending" || status === "approved";
  const dirty = JSON.stringify(f) !== JSON.stringify(base);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const err = (k: string) => fieldError(errors, k);
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  const baseCover = useRef<string | null>(article?.cover_image?.id ?? null);
  const local = useLocalDraft(`aprosop:article-draft:pro:${idRef.current ?? "new"}`, f.title, f.content, article?.updated_at ?? null);

  const fail = (x: unknown) => {
    if (x instanceof ApiError) {
      setErrors(x.fields);
      toast(x.message, { error: true });
    } else toast("Не получилось сохранить. Попробуйте ещё раз.", { error: true });
  };

  /** Save the current form; edits made while the request is in flight stay dirty. */
  const persist = useCallback(
    async (form: Form): Promise<MyArticle> => {
      if (inflight.current) await inflight.current.catch(() => null);
      const body: MyArticleInput = {
        title: form.title.trim(),
        summary: form.summary.trim(),
        content: form.content,
        ...(form.topics.length ? { topics: form.topics } : {}),
        sources: cleanSources(form.sources),
        ...((form.cover_image?.id ?? null) !== baseCover.current ? { cover_image_id: form.cover_image?.id ?? null } : {}),
      };
      const id = idRef.current;
      const req = id ? myArticlesApi.update(id, body) : myArticlesApi.create(body);
      inflight.current = req;
      try {
        const saved = await req;
        if (!id) {
          idRef.current = saved.id;
          local.clear();
        }
        baseCover.current = form.cover_image?.id ?? null;
        setBase(form);
        setErrors({});
        onSavedRef.current(saved);
        return saved;
      } finally {
        inflight.current = null;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Autosave drafts: a few seconds after typing stops (needs a title to create the article)
  const canAutosave = !locked && dirty && f.title.trim().length >= 3;
  useEffect(() => {
    if (!canAutosave) return;
    const form = f;
    const t = window.setTimeout(() => {
      setSaving("saving");
      persist(form)
        .then(() => setSaving("idle"))
        .catch((x) => {
          setSaving("error");
          if (x instanceof ApiError) setErrors(x.fields);
        });
    }, AUTOSAVE_MS);
    return () => window.clearTimeout(t);
  }, [f, canAutosave, persist]);

  const submit = async () => {
    setBusy("submit");
    setErrors({});
    try {
      const saved = dirty || !idRef.current ? await persist(f) : article!;
      const sent = await myArticlesApi.submit(saved.id);
      toast("Статья отправлена на модерацию");
      onSaved(sent);
    } catch (x) {
      fail(x);
    } finally {
      setBusy(null);
    }
  };

  const withdraw = async () => {
    if (!idRef.current) return;
    setBusy("withdraw");
    try {
      const a = await myArticlesApi.withdraw(idRef.current);
      toast(status === "approved" ? "Статья снята с публикации" : "Статья вернулась в черновики");
      onSaved(a);
    } catch (x) {
      fail(x);
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!idRef.current) return;
    setBusy("delete");
    try {
      await myArticlesApi.remove(idRef.current);
      local.clear();
      toast("Статья удалена");
      onDeleted();
    } catch (x) {
      fail(x);
      setBusy(null);
    }
  };

  const minutes = Math.max(1, Math.round(words / 160));
  const preview = {
    id: 0,
    slug: article?.slug ?? "preview",
    title: f.title || "Заголовок статьи",
    summary: f.summary,
    topic: f.topics[0] ?? "therapy",
    topic_label: topicLabel(f.topics[0] ?? "therapy"),
    topics: f.topics,
    tags: [],
    cover: (article?.cover ?? "sky") as Cover,
    cover_image: f.cover_image,
    emoji: "",
    reading_minutes: minutes,
    author_name: name,
    published_at: article?.published_at ?? null,
    specialist: { id: 0, name, photo_url: photo },
  };

  const saveLabel = locked
    ? null
    : saving === "saving"
      ? ["saving", "Сохраняю…"]
      : saving === "error" && dirty
        ? ["error", "Не сохранилось"]
        : dirty
          ? ["dirty", f.title.trim().length >= 3 ? "Изменения" : "Нужен заголовок"]
          : idRef.current
            ? ["saved", "Сохранено"]
            : null;

  return (
    <div className={e.page}>
      <div className={e.bar}>
        <div className={e.barInfo}>
          <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
          {saveLabel && (
            <span className={e.saveState} data-state={saveLabel[0]} role="status">
              {saveLabel[1]}
            </span>
          )}
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
          {!locked && (
            <Button variant="primary" size="sm" loading={busy === "submit"} disabled={!!busy} onClick={submit} icon={<Send size={16} />}>
              На&nbsp;модерацию
            </Button>
          )}
          {status === "approved" && article && (
            <Button variant="ghost" size="sm" href={`/app/articles/${article.slug}`} icon={<Eye size={16} />}>
              Открыть
            </Button>
          )}
          {locked && (
            <Button variant="secondary" size="sm" loading={busy === "withdraw"} disabled={!!busy} onClick={withdraw} icon={<Undo2 size={16} />}>
              {status === "approved" ? "Снять с публикации" : "Вернуть в черновики"}
            </Button>
          )}
        </div>
      </div>

      {status === "rejected" && article?.moderation_comment && (
        <p className={e.notice} data-tone="danger" role="status">
          <span>
            <strong>Комментарий редакции.</strong> {article.moderation_comment}
          </span>
        </p>
      )}
      {locked && (
        <p className={e.notice}>
          <span>
            {status === "pending"
              ? "Статья на модерации. Чтобы что-то поменять, верните её в черновики."
              : `Опубликована${article?.reads ? ` · ${article.reads} прочтений` : ""}. Чтобы изменить текст, снимите её с публикации.`}
          </span>
        </p>
      )}
      {local.restore && !locked && (
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
            <TitleField value={f.title} onChange={(v) => set("title", v)} error={err("title")} placeholder="Заголовок" />
            <RichEditor
              value={f.content}
              onChange={(v) => set("content", v)}
              onWords={setWords}
              onError={(m) => toast(m, { error: true })}
              editable={!locked}
            />
            {err("content") && <div className={e.fieldError}>{err("content")}</div>}
            {!locked && words > 0 && words < MIN_WORDS && (
              <p className={p.note}>Для&nbsp;модерации нужно от&nbsp;{MIN_WORDS}&nbsp;слов.</p>
            )}
          </>
        ) : (
          <ArticlePreview a={preview} content={f.content} sources={cleanSources(f.sources)} />
        )}
      </div>

      <section className={e.details} aria-label="Для ленты">
        <h2 className={e.detailsTitle}>Для&nbsp;ленты</h2>
        <div className={e.detailsGrid}>
          <fieldset className={`${e.detailsMain} ${p.fieldset}`} disabled={locked}>
            <Textarea
              label="Короткое описание"
              value={f.summary}
              onChange={(ev) => set("summary", ev.target.value)}
              error={err("summary")}
              rows={2}
              maxLength={400}
              hint="1–2&nbsp;предложения для&nbsp;карточки"
            />
            <TopicPicker value={f.topics} onChange={(v) => set("topics", v)} error={err("topics") ?? err("topic")} />
            <CoverUploader value={f.cover_image} onChange={(v) => set("cover_image", v)} error={err("cover_image_id")} />
          </fieldset>
          <div className={e.detailsSide}>
            <span className={e.sideLabel}>Так выглядит карточка</span>
            <ArticleCard a={preview} />
          </div>
        </div>
        <fieldset className={p.fieldset} disabled={locked}>
          <EvidenceFields
            title="Источники"
            sub="Необязательно. Исследования и&nbsp;книги, на&nbsp;которые вы&nbsp;опираетесь; в&nbsp;тексте&nbsp;— [1], [2]."
            sources={f.sources}
            onSources={(v) => set("sources", v)}
            errors={err}
          />
        </fieldset>
        {idRef.current && (
          <div>
            {confirmDelete ? (
              <div className={e.notice}>
                <span>Удалить статью навсегда?</span>
                <Button variant="danger" size="sm" loading={busy === "delete"} onClick={remove}>
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
