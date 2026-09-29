"use client";

import { Suspense, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, FileText, Plus, Search } from "lucide-react";
import { Badge, Button, Card, EmptyState, Input, Segmented, Skeleton } from "@/ui";
import { PageHeader } from "@/components/shell/AppShell";
import { useLoad } from "@/components/client/useLoad";
import { ErrorBlock } from "@/components/client/ClientBits";
import { plural } from "@/lib/format";
import { contentAdminApi, PRACTICE_KINDS, TOPICS, type ArticleDraft, type PracticeDraft } from "@/lib/api/content";
import { ArticleEditor } from "@/components/content/cms/ArticleEditor";
import { PracticeEditor } from "@/components/content/cms/PracticeEditor";
import { ModerationPanel } from "@/components/content/cms/ModerationPanel";
import { SpecialistPhoto } from "@/components/avatar/SpecialistPhoto";
import { useStaff } from "@/components/admin/AdminShell";
import { moderationApi, STATUS_LABEL, type ArticleStatus } from "@/lib/api/authoring";
import c from "@/components/content/content.module.css";
import s from "@/components/content/cms/cms.module.css";
import pa from "@/components/pro/articles/articles.module.css";
import { EmptyArt } from "@/components/illustrations";

type Tab = "articles" | "practices" | "specialists";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

function ContentCms() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname() ?? "/admin/content";
  const rawTab = params?.get("tab");
  const tab: Tab = rawTab === "practices" || rawTab === "specialists" ? rawTab : "articles";
  const { can } = useStaff();
  const edit = params?.get("edit") ?? null; // id or "new"
  const [q, setQ] = useState("");

  const articles = useLoad(() => contentAdminApi.articles());
  const practices = useLoad(() => contentAdminApi.practices());
  // «От специалистов»: очередь модерации (черновики специалистов сюда не попадают)
  const queue = useLoad(() => moderationApi.queue());
  const pendingCount = (queue.data ?? []).filter((a) => a.moderation === "pending").length;

  const go = (next: { tab?: Tab; edit?: string | null }) => {
    const sp = new URLSearchParams();
    const t = next.tab ?? tab;
    if (t !== "articles") sp.set("tab", t);
    const e = next.edit === undefined ? edit : next.edit;
    if (e) sp.set("edit", e);
    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: true });
  };

  const topicLabel = (v: string) => TOPICS.find((t) => t.value === v)?.label ?? v;
  const kindLabel = (v: string) => PRACTICE_KINDS.find((k) => k.value === v)?.label ?? v;

  const filteredA = useMemo(
    () => (articles.data ?? []).filter((a) => !a.specialist && (!q || a.title.toLowerCase().includes(q.toLowerCase()))),
    [articles.data, q],
  );
  const filteredP = useMemo(
    () => (practices.data ?? []).filter((p) => !q || p.title.toLowerCase().includes(q.toLowerCase())),
    [practices.data, q],
  );

  // ── Specialist article review ──────────────────────────────────────────
  if (edit && tab === "specialists") {
    const item = queue.data?.find((a) => a.id === Number(edit)) ?? null;
    return (
      <>
        <Button variant="ghost" size="sm" onClick={() => go({ edit: null })} icon={<ArrowLeft size={18} strokeWidth={1.8} />} style={{ marginLeft: -8, marginBottom: 12 }}>
          От&nbsp;специалистов
        </Button>
        <PageHeader title={item?.title ?? "Статья специалиста"} />
        {!queue.data ? (
          <Skeleton height={420} radius={22} />
        ) : !item ? (
          <EmptyState art={<EmptyArt scene="lost" />} title="Статья не&nbsp;найдена" text="Возможно, автор вернул её&nbsp;в&nbsp;черновики." action={<Button onClick={() => go({ edit: null })}>К&nbsp;списку</Button>} />
        ) : (
          <ModerationPanel
            key={item.id}
            article={item}
            canPublish={can("content.publish")}
            onChanged={(a) => {
              queue.setData((queue.data ?? []).map((x) => (x.id === a.id ? a : x)));
              articles.reload();
            }}
          />
        )}
      </>
    );
  }

  // ── Editor view ────────────────────────────────────────────────────────
  if (edit) {
    const isNew = edit === "new";
    const id = Number(edit);
    const loading = tab === "articles" ? !articles.data : !practices.data;
    const article = tab === "articles" && !isNew ? articles.data?.find((a) => a.id === id) ?? null : null;
    const practice = tab === "practices" && !isNew ? practices.data?.find((p) => p.id === id) ?? null : null;
    const missing = !isNew && !loading && !(article || practice);
    const title = isNew
      ? tab === "articles" ? "Новая статья" : "Новая практика"
      : (article?.title ?? practice?.title ?? "Редактирование");

    const onSavedA = (a: ArticleDraft) => {
      articles.setData([a, ...(articles.data ?? []).filter((x) => x.id !== a.id)]);
      if (isNew) router.replace(`${pathname}?edit=${a.id}`);
    };
    const onSavedP = (p: PracticeDraft) => {
      practices.setData([...(practices.data ?? []).filter((x) => x.id !== p.id), p].sort((a, b) => a.order - b.order || a.id - b.id));
      if (isNew) router.replace(`${pathname}?tab=practices&edit=${p.id}`);
    };
    const onDeleted = () => {
      if (tab === "articles") articles.reload();
      else practices.reload();
      go({ edit: null });
    };

    return (
      <>
        <Button variant="ghost" size="sm" onClick={() => go({ edit: null })} icon={<ArrowLeft size={18} strokeWidth={1.8} />} style={{ marginLeft: -8, marginBottom: 12 }}>
          {tab === "articles" ? "Все статьи" : "Все практики"}
        </Button>
        <PageHeader title={title} />
        {loading && !isNew ? (
          <Skeleton height={420} radius={22} />
        ) : missing ? (
          <EmptyState art={<EmptyArt scene="lost" />} title="Материал не&nbsp;найден" text="Возможно, его уже удалили." action={<Button onClick={() => go({ edit: null })}>К&nbsp;списку</Button>} />
        ) : tab === "articles" ? (
          <ArticleEditor key={edit} article={article} onSaved={onSavedA} onDeleted={onDeleted} />
        ) : (
          <PracticeEditor key={edit} practice={practice} onSaved={onSavedP} onDeleted={onDeleted} />
        )}
      </>
    );
  }

  // ── List view ──────────────────────────────────────────────────────────
  const current = tab === "articles" ? articles : tab === "practices" ? practices : queue;
  const filteredS = (queue.data ?? []).filter((a) => !q || a.title.toLowerCase().includes(q.toLowerCase()));
  const shown = tab === "articles" ? filteredA : tab === "practices" ? filteredP : filteredS;
  const count = (xs: { is_published: boolean }[] | null) => {
    const all = xs ?? [];
    return `${all.filter((x) => x.is_published).length} из\u00a0${all.length}`;
  };

  return (
    <>
      <PageHeader
        title="Статьи и&nbsp;практики"
        action={
          tab === "specialists" ? undefined : (
            <Button variant="primary" onClick={() => go({ edit: "new" })} icon={<Plus size={18} strokeWidth={2} />}>
              {tab === "articles" ? "Новая статья" : "Новая практика"}
            </Button>
          )
        }
      />
      <Card as="section">
        <div className={s.listTop}>
          <Segmented
            value={tab}
            onChange={(t) => go({ tab: t, edit: null })}
            ariaLabel="Раздел"
            options={[
              { value: "articles", label: `Статьи${articles.data ? ` ${count(articles.data.filter((a) => !a.specialist))}` : ""}` },
              { value: "practices", label: `Практики${practices.data ? ` ${count(practices.data)}` : ""}` },
              { value: "specialists", label: `От\u00a0специалистов${pendingCount ? ` ${pendingCount}` : ""}` },
            ]}
          />
          <div className={s.search}>
            <Input aria-label="Поиск по&nbsp;названию" placeholder="Поиск по&nbsp;названию" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>

        {current.error ? (
          <ErrorBlock message={current.error} onRetry={current.reload} />
        ) : current.loading && !current.data ? (
          <div className={s.rows}>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} height={64} radius={18} />
            ))}
          </div>
        ) : shown.length === 0 ? (
          <EmptyState art={<EmptyArt scene={q ? "search" : "plane"} />}
            icon={q ? <Search size={28} strokeWidth={1.8} /> : <FileText size={28} strokeWidth={1.8} />}
            title={q ? "Ничего не\u00a0нашлось" : "Пока пусто"}
            text={q ? "Попробуйте другое слово." : tab === "specialists" ? "Когда специалист отправит статью на\u00a0модерацию, она появится здесь." : "Создайте первый материал: он\u00a0появится у\u00a0клиентов после публикации."}
          />
        ) : (
          <ul className={s.rows}>
            {tab === "specialists"
              ? filteredS.map((a) => {
                  const st = (a.moderation || "pending") as ArticleStatus;
                  return (
                    <li key={a.id}>
                      <button type="button" className={s.row} onClick={() => go({ edit: String(a.id) })}>
                        <SpecialistPhoto url={a.specialist?.photo_url} name={a.specialist?.name ?? "?"} size={44} alt="" />
                        <span className={s.rowText}>
                          <strong>{a.title}</strong>
                          <em className={pa.mStatus} data-s={st}>
                            {STATUS_LABEL[st]}
                          </em>
                          <span>
                            {a.specialist?.name}, {topicLabel(a.topic)}
                          </span>
                        </span>
                        <span className={s.rowMeta}>
                          {a.editors_choice && <Badge tone="sun">Выбор редакции</Badge>}
                          <Badge tone={st === "pending" ? "warning" : st === "approved" ? "success" : st === "rejected" ? "danger" : "neutral"}>{STATUS_LABEL[st]}</Badge>
                        </span>
                      </button>
                    </li>
                  );
                })
              : tab === "articles"
              ? filteredA.map((a) => (
                  <li key={a.id}>
                    <button type="button" className={s.row} onClick={() => go({ edit: String(a.id) })}>
                      <span className={`${s.rowIcon} ${c.tone}`} data-tone={a.cover} aria-hidden>
                        {a.emoji || "📖"}
                      </span>
                      <span className={s.rowText}>
                        <strong>{a.title}</strong>
                        <span>
                          {topicLabel(a.topic)}, {a.reading_minutes} мин
                        </span>
                      </span>
                      <span className={s.rowMeta}>
                        <span>Изменено {fmtDate(a.updated_at)}</span>
                        {a.is_published ? <Badge tone="success">Опубликована</Badge> : <Badge>Черновик</Badge>}
                      </span>
                    </button>
                  </li>
                ))
              : filteredP.map((p) => (
                  <li key={p.id}>
                    <button type="button" className={s.row} onClick={() => go({ edit: String(p.id) })}>
                      <span className={`${s.rowIcon} ${c.tone}`} data-tone={p.cover} aria-hidden>
                        {p.emoji || "🌿"}
                      </span>
                      <span className={s.rowText}>
                        <strong>{p.title}</strong>
                        <span>
                          {kindLabel(p.kind)}, {p.duration_minutes} мин,{" "}
                          {p.pattern ? "дыхательный круг" : `${p.steps.length} ${plural(p.steps.length, "шаг", "шага", "шагов")}`}
                        </span>
                      </span>
                      <span className={s.rowMeta}>
                        <span>Изменено {fmtDate(p.updated_at)}</span>
                        {p.is_published ? <Badge tone="success">Опубликована</Badge> : <Badge>Черновик</Badge>}
                      </span>
                    </button>
                  </li>
                ))}
          </ul>
        )}
      </Card>
    </>
  );
}

export default function ContentCmsPage() {
  return (
    <Suspense fallback={null}>
      <ContentCms />
    </Suspense>
  );
}
