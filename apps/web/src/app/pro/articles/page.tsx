"use client";

import { Suspense, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import { Badge, Button, Card, EmptyState, Skeleton } from "@/ui";
import { PageHeader } from "@/components/shell/AppShell";
import { useLoad } from "@/components/client/useLoad";
import { ErrorBlock } from "@/components/client/ClientBits";
import { EmptyArt } from "@/components/illustrations";
import { TopicArt } from "@/components/illustrations/topics";
import { SpecialistArticleEditor, STATUS_TONE } from "@/components/pro/articles/SpecialistArticleEditor";
import { myArticlesApi, STATUS_LABEL, type MyArticle } from "@/lib/api/authoring";
import { useAuth } from "@/lib/auth/store";
import c from "@/components/content/content.module.css";
import s from "@/components/content/cms/cms.module.css";
import p from "@/components/pro/articles/articles.module.css";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

function MyArticles() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname() ?? "/pro/articles";
  const edit = params?.get("edit") ?? null;
  const list = useLoad(() => myArticlesApi.list());
  const user = useAuth((x) => x.user);
  const name = user?.psychologist?.display_name || "Вы";
  const photo = user?.psychologist?.photo_url ?? null;

  // A new article gets its id on the first autosave; the editor must not remount then
  const [created, setCreated] = useState<number | null>(null);
  const go = (e: string | null) => {
    setCreated(null);
    router.push(e ? `${pathname}?edit=${e}` : pathname, { scroll: true });
  };

  if (edit) {
    const isNew = edit === "new";
    const article = isNew ? null : list.data?.find((a) => a.id === Number(edit)) ?? null;
    const onSaved = (a: MyArticle) => {
      list.setData([a, ...(list.data ?? []).filter((x) => x.id !== a.id)]);
      if (isNew) {
        setCreated(a.id);
        router.replace(`${pathname}?edit=${a.id}`, { scroll: false });
      }
    };
    return (
      <>
        <Button variant="ghost" size="sm" onClick={() => go(null)} icon={<ArrowLeft size={18} strokeWidth={1.8} />} style={{ marginLeft: -8, marginBottom: 12 }}>
          Мои статьи
        </Button>
        {!isNew && !list.data ? (
          <Skeleton height={420} radius={22} />
        ) : !isNew && !article ? (
          <EmptyState art={<EmptyArt scene="lost" />} title="Статья не&nbsp;найдена" text="Возможно, её&nbsp;уже удалили." action={<Button onClick={() => go(null)}>К&nbsp;списку</Button>} />
        ) : (
          <SpecialistArticleEditor
            key={created !== null && Number(edit) === created ? "new" : edit}
            article={article}
            name={name}
            photo={photo}
            onSaved={onSaved}
            onDeleted={() => {
              list.reload();
              go(null);
            }}
          />
        )}
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Мои статьи"
        action={
          <Button variant="primary" onClick={() => go("new")} icon={<Plus size={18} strokeWidth={2} />}>
            Новая статья
          </Button>
        }
      />
      <p className={p.intro}>Статьи проходят модерацию и&nbsp;выходят в&nbsp;ленте «От&nbsp;специалистов» с&nbsp;вашим именем и&nbsp;ссылкой на&nbsp;профиль.</p>
      {list.error ? (
        <ErrorBlock message={list.error} onRetry={list.reload} />
      ) : !list.data ? (
        <div className={s.rows}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={64} radius={18} />
          ))}
        </div>
      ) : list.data.length === 0 ? (
        <Card>
          <EmptyState
            art={<EmptyArt scene="plane" />}
            title="Пока нет статей"
            text="Расскажите о&nbsp;том, в&nbsp;чём разбираетесь: клиенты читают и&nbsp;приходят к&nbsp;авторам."
            action={
              <Button variant="primary" onClick={() => go("new")} icon={<Plus size={18} />}>
                Написать статью
              </Button>
            }
          />
        </Card>
      ) : (
        <ul className={s.rows}>
          {list.data.map((a) => (
            <li key={a.id}>
              <button type="button" className={s.row} onClick={() => go(String(a.id))}>
                {a.cover_image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className={p.thumb} src={a.cover_image.sm} alt="" />
                ) : (
                  <span className={`${p.thumb} ${p.thumbTone} ${c.tone}`} data-tone={a.cover} aria-hidden>
                    <TopicArt topic={a.topic} className={p.thumbArt} />
                  </span>
                )}
                <span className={s.rowText}>
                  <strong>{a.title || "Без\u00a0названия"}</strong>
                  <em className={p.mStatus} data-s={a.status}>
                    {STATUS_LABEL[a.status]}
                  </em>
                  {a.status === "rejected" && a.moderation_comment ? (
                    <span className={p.rowComment}>{a.moderation_comment}</span>
                  ) : (
                    <span>
                      {a.topic_label}
                      {a.status === "approved" && a.reads ? ` · ${a.reads} прочтений` : ""}
                    </span>
                  )}
                </span>
                <span className={s.rowMeta}>
                  <span className={p.date}>{fmtDate(a.updated_at)}</span>
                  <Badge tone={STATUS_TONE[a.status]}>{STATUS_LABEL[a.status]}</Badge>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function ProArticlesPage() {
  return (
    <Suspense fallback={null}>
      <MyArticles />
    </Suspense>
  );
}
