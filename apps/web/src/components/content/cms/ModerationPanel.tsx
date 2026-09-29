"use client";

import { useState } from "react";
import { Check, Eye, Undo2 } from "lucide-react";
import { Badge, Button, Card, Textarea, useToast } from "@/ui";
import { SpecialistPhoto } from "@/components/avatar/SpecialistPhoto";
import { moderationApi, STATUS_LABEL, type ArticleStatus } from "@/lib/api/authoring";
import type { ArticleDraft } from "@/lib/api/content";
import { ArticleBanner } from "../ArticleBanner";
import { RichText } from "../RichText";
import { Sources } from "../Evidence";
import { Switch } from "./fields";
import s from "./cms.module.css";
import m from "./moderation.module.css";

const TONE: Record<ArticleStatus, "neutral" | "warning" | "success" | "danger"> = {
  draft: "neutral",
  pending: "warning",
  approved: "success",
  rejected: "danger",
};

/** Staff review of a specialist's article: read it as clients will, then publish or return with a comment. */
export function ModerationPanel({ article: a, canPublish, onChanged }: { article: ArticleDraft; canPublish: boolean; onChanged: (a: ArticleDraft) => void }) {
  const toast = useToast();
  const [comment, setComment] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const status = (a.moderation || "pending") as ArticleStatus;
  const sp = a.specialist;

  const run = async (key: string, fn: () => Promise<ArticleDraft>, done: string) => {
    setBusy(key);
    try {
      const x = await fn();
      toast(done);
      setRejecting(false);
      setComment("");
      onChanged(x);
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={s.editor}>
      <div className={s.main}>
        <Card as="article" className={m.doc}>
          <ArticleBanner a={a} className={m.banner} />
          <span className={m.kicker}>
            {a.topic_label} · {a.reading_minutes} мин
          </span>
          <h2 className={m.title}>{a.title}</h2>
          {a.summary && <p className={m.lead}>{a.summary}</p>}
          <RichText html={a.content} />
          <Sources sources={a.sources} level={a.evidence_level} reviewedAt={null} />
        </Card>
      </div>
      <aside className={s.side}>
        <Card as="section">
          {sp && (
            <div className={m.author}>
              <SpecialistPhoto url={sp.photo_url} name={sp.name} size={40} alt="" />
              <span>
                <strong>{sp.name}</strong>
                <a href={`/app/specialists/${sp.id}`} target="_blank" rel="noreferrer">
                  Профиль
                </a>
              </span>
            </div>
          )}
          <div className={s.status}>
            <span>Статус</span>
            <Badge tone={TONE[status]}>{STATUS_LABEL[status]}</Badge>
          </div>
          {a.submitted_at && <p className={m.muted}>Отправлена {new Date(a.submitted_at).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>}
          {status === "rejected" && a.moderation_comment && <p className={m.comment}>{a.moderation_comment}</p>}

          {!canPublish ? (
            <p className={m.muted}>Решение принимают сотрудники с&nbsp;правом публикации.</p>
          ) : status === "pending" ? (
            rejecting ? (
              <div className={s.actions}>
                <Textarea label="Что&nbsp;поправить" value={comment} onChange={(e) => setComment(e.target.value)} rows={4} maxLength={1000} hint="Автор увидит это&nbsp;в&nbsp;кабинете" autoFocus />
                <Button variant="danger" block loading={busy === "reject"} disabled={!comment.trim()} onClick={() => run("reject", () => moderationApi.moderate(a.id, "reject", comment.trim()), "Статья возвращена автору")}>
                  Вернуть автору
                </Button>
                <Button variant="ghost" block onClick={() => setRejecting(false)}>
                  Отмена
                </Button>
              </div>
            ) : (
              <div className={s.actions}>
                <Button variant="primary" block icon={<Check size={16} />} loading={busy === "approve"} onClick={() => run("approve", () => moderationApi.moderate(a.id, "approve"), "Статья опубликована")}>
                  Опубликовать
                </Button>
                <Button variant="secondary" block icon={<Undo2 size={16} />} onClick={() => setRejecting(true)}>
                  Вернуть с&nbsp;комментарием
                </Button>
              </div>
            )
          ) : status === "approved" ? (
            <div className={s.actions}>
              <Switch
                checked={!!a.editors_choice}
                onChange={(v) => void run("choice", () => moderationApi.editorsChoice(a.id, v), v ? "Отмечено: выбор редакции" : "Отметка снята")}
                label="Выбор редакции"
                hint="Значок на&nbsp;карточке и&nbsp;чуть выше в&nbsp;ленте"
              />
              <Button variant="ghost" block href={`/articles/${a.slug}`} icon={<Eye size={16} />}>
                Открыть на&nbsp;сайте
              </Button>
              {!!a.reads && <p className={m.muted}>{a.reads} прочтений</p>}
            </div>
          ) : null}
        </Card>
      </aside>
    </div>
  );
}
