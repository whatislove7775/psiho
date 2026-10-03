"use client";

import { t } from "@/lib/i18n";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Eye, EyeOff, MessageCircleQuestion, Pencil, Plus, Send, Trash2, X } from "lucide-react";
import { Badge, Button, Card, CardHead, EmptyState, Modal, Skeleton, Textarea, useToast } from "@/ui";
import { EmptyArt } from "@/components/illustrations";
import { ApiError } from "@/lib/api/client";
import {
  STATUS_LABEL,
  STATUS_TONE,
  credentialsApi,
  periodLabel,
  type Credential,
  type CredentialStatus,
} from "@/lib/api/credentials";
import { plural } from "@/lib/format";
import { CredentialForm, checkFile } from "./CredentialForm";
import { DocTile, DocViewer } from "./DocViewer";
import { KindIcon } from "./kinds";
import s from "./credentials.module.css";

const ORDER: CredentialStatus[] = ["needs_info", "rejected", "pending", "approved"];

/** /pro/profile → «Документы и квалификация». */
export function CredentialsSection() {
  const toast = useToast();
  const [items, setItems] = useState<Credential[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<{ item: Credential | null } | null>(null);
  const [removing, setRemoving] = useState<Credential | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setError(null);
    credentialsApi
      .mine()
      .then(setItems)
      .catch((e) => setError((e as Error).message));
  }, []);
  useEffect(load, [load]);

  const replace = (c: Credential) => setItems((xs) => (xs ? (xs.some((x) => x.id === c.id) ? xs.map((x) => (x.id === c.id ? c : x)) : [c, ...xs]) : [c]));

  const counts = (items ?? []).reduce<Record<string, number>>((acc, c) => ((acc[c.status] = (acc[c.status] ?? 0) + 1), acc), {});
  const sorted = [...(items ?? [])].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || (b.year ?? 0) - (a.year ?? 0));

  return (
    <Card as="section">
      <span id="documents" style={{ display: "block", scrollMarginTop: 16 }} />
      <CardHead
        title={t("Документы и\u00a0квалификация")}
        sub={t("Дипломы, переподготовка, супервизия, публикации. Каждый пункт проверяет сотрудник Aprosop, подтверждённые видны клиентам на\u00a0вашей странице")}
        action={
          items && items.length > 0 ? (
            <Button variant="soft" size="sm" icon={<Plus size={16} />} onClick={() => setForm({ item: null })}>
              {t("Добавить")}
            </Button>
          ) : undefined
        }
      />
      {error ? (
        <div className={s.alert}>
          <AlertCircle size={16} />
          <span>
            {error}{" "}
            <Button variant="ghost" size="sm" onClick={load}>
              {t("Повторить")}
            </Button>
          </span>
        </div>
      ) : !items ? (
        <div className={s.items}>
          <Skeleton height={84} radius={18} />
          <Skeleton height={84} radius={18} />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          art={<EmptyArt scene="shield" />}
          title={t("Расскажите о\u00a0своём образовании")}
          text={t("Клиенты чаще выбирают специалистов с\u00a0проверенными документами. Начните с\u00a0диплома, затем добавьте переподготовку, супервизию и\u00a0публикации.")}
          action={
            <Button variant="primary" icon={<Plus size={18} />} onClick={() => setForm({ item: null })}>
              {t("Добавить документ")}
            </Button>
          }
        />
      ) : (
        <>
          <div className={s.summary}>
            {(["approved", "pending", "needs_info", "rejected"] as CredentialStatus[])
              .filter((st) => counts[st])
              .map((st) => (
                <Badge key={st} tone={STATUS_TONE[st]} dot>
                  {STATUS_LABEL[st]}: {counts[st]}
                </Badge>
              ))}
          </div>
          <div className={s.items}>
            {sorted.map((c) => (
              <Item key={c.id} c={c} onChange={replace} onEdit={() => setForm({ item: c })} onRemove={() => setRemoving(c)} />
            ))}
          </div>
        </>
      )}

      <CredentialForm
        open={!!form}
        item={form?.item ?? null}
        onClose={() => setForm(null)}
        onSaved={(c, warning) => {
          replace(c);
          setForm(null);
          toast(warning ?? (c.status === "pending" ? t("Отправили на\u00a0проверку. Обычно это\u00a0занимает до\u00a0двух рабочих дней") : t("Сохранено")), {
            error: !!warning,
          });
        }}
      />
      <Modal open={!!removing} onClose={() => !busy && setRemoving(null)} title={t("Удалить документ?")}>
        <p className={s.hint} style={{ marginBottom: 20 }}>
          «{removing?.title}{t("» и\u00a0все его файлы удалятся без\u00a0возможности восстановления.")}
          {removing?.status === "approved" ? t(" Пункт пропадёт с\u00a0вашей страницы.") : ""}
        </p>
        <div className={s.actions}>
          <Button variant="ghost" onClick={() => setRemoving(null)} disabled={busy}>
            {t("Отмена")}
          </Button>
          <Button
            variant="danger"
            loading={busy}
            onClick={async () => {
              if (!removing) return;
              setBusy(true);
              try {
                await credentialsApi.remove(removing.id);
                setItems((xs) => xs?.filter((x) => x.id !== removing.id) ?? null);
                setRemoving(null);
                toast(t("Документ удалён"));
              } catch (e) {
                toast((e as Error).message, { error: true });
              } finally {
                setBusy(false);
              }
            }}
          >
            {t("Удалить")}
          </Button>
        </div>
      </Modal>
    </Card>
  );
}

function Item({
  c,
  onChange,
  onEdit,
  onRemove,
}: {
  c: Credential;
  onChange: (c: Credential) => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const toast = useToast();
  const [viewer, setViewer] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    const fresh = (await credentialsApi.mine()).find((x) => x.id === c.id);
    if (fresh) onChange(fresh);
  };

  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(list)) {
        const err = checkFile(file);
        if (err) {
          toast(err, { error: true });
          continue;
        }
        await credentialsApi.upload(c.id, file, false);
      }
      await refresh();
      if (c.status === "approved") toast(t("Файл добавлен, пункт снова на\u00a0проверке"));
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t("Не\u00a0получилось загрузить файл"), { error: true });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const toggle = async (fid: string, next: boolean) => {
    try {
      await credentialsApi.setPublic(fid, next);
      await refresh();
      if (next && c.status === "approved") toast(t("Сотрудник посмотрит файл перед публикацией"));
    } catch (e) {
      toast((e as Error).message, { error: true });
    }
  };

  const removeFile = async (fid: string) => {
    try {
      await credentialsApi.removeFile(fid);
      await refresh();
    } catch (e) {
      toast((e as Error).message, { error: true });
    }
  };

  const send = async () => {
    if (!reply.trim()) return;
    setSending(true);
    try {
      onChange(await credentialsApi.reply(c.id, reply.trim()));
      setReply("");
      toast(t("Ответ отправлен, пункт снова на\u00a0проверке"));
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setSending(false);
    }
  };

  const meta = [c.issuer, c.supervisor && t(`супервизор {supervisor}`, { supervisor: c.supervisor }), periodLabel(c), c.hours && `${c.hours} ${plural(c.hours, "час", "часа", "часов")}`]
    .filter(Boolean)
    .join(", ");
  const staffNotes = c.notes.filter((n) => n.author_role !== "system");

  return (
    <article className={s.item}>
      <div className={s.itemHead}>
        <KindIcon kind={c.kind} className={s.kindIcon} />
        <div style={{ minWidth: 0 }}>
          <div className={s.itemKind}>{c.kind_label}</div>
          <div className={s.itemTitle}>{c.title}</div>
          {meta && <div className={s.itemMeta}>{meta}</div>}
          {(c.url || c.doi) && (
            <div className={s.itemMeta}>
              {c.doi ? `DOI ${c.doi}` : ""}
              {c.doi && c.url ? ", " : ""}
              {c.url && (
                <a href={c.url} target="_blank" rel="noopener noreferrer nofollow" style={{ color: "var(--c-primary-ink)" }}>
                  {t("ссылка")}
                </a>
              )}
            </div>
          )}
        </div>
        <div className={s.itemActions}>
          <Badge tone={STATUS_TONE[c.status]} dot>
            {c.status === "pending" && c.was_approved ? t("Повторная проверка") : STATUS_LABEL[c.status]}
          </Badge>
          <Button variant="ghost" size="sm" iconOnly aria-label={t("Изменить")} icon={<Pencil size={16} />} onClick={onEdit} />
          <Button variant="ghost" size="sm" iconOnly aria-label={t("Удалить")} icon={<Trash2 size={16} />} onClick={onRemove} />
        </div>
      </div>

      {c.status === "rejected" && c.reject_reason && (
        <div className={s.alert}>
          <X size={16} />
          <span>
            <b>{t("Отклонено:")}</b> {c.reject_reason}{t(". Исправьте данные или\u00a0приложите другой файл, и\u00a0пункт снова уйдёт на\u00a0проверку.")}
          </span>
        </div>
      )}

      {(c.status === "needs_info" || staffNotes.length > 0) && (
        <div className={s.thread} aria-label={t("Переписка с\u00a0сотрудником")}>
          {c.notes.map((n) => (
            <div key={n.id} className={s.note} data-role={n.author_role}>
              {n.author_role !== "system" && <span className={s.noteWho}>{n.author_role === "staff" ? t("Команда Aprosop") : t("Вы")}</span>}
              {n.text}
            </div>
          ))}
          {(c.status === "needs_info" || c.status === "rejected") && (
            <div className={s.replyRow}>
              <Textarea
                aria-label={t("Ответ сотруднику")}
                rows={2}
                maxLength={2000}
                value={reply}
                placeholder={c.status === "needs_info" ? t("Ответьте на\u00a0вопрос или\u00a0приложите файл ниже") : t("Комментарий для\u00a0сотрудника")}
                onChange={(e) => setReply(e.target.value)}
              />
              <Button variant="primary" iconOnly aria-label={t("Отправить")} icon={<Send size={18} />} loading={sending} disabled={!reply.trim()} onClick={send} />
            </div>
          )}
        </div>
      )}

      <div className={s.tiles}>
        {c.files.map((f, i) => (
          <DocTile key={f.id} file={f} onOpen={() => setViewer(i)}>
            <div className={s.tileRow}>
              <button
                type="button"
                className={s.vis}
                data-on={f.is_public || undefined}
                aria-pressed={!!f.is_public}
                title={f.is_public ? t("Клиенты увидят файл после проверки") : t("Файл видит только сотрудник")}
                onClick={() => toggle(f.id, !f.is_public)}
              >
                {f.is_public ? <Eye size={12} /> : <EyeOff size={12} />}
                {f.is_public ? t("Публично") : t("Проверка")}
              </button>
              <button type="button" className={s.tileDel} aria-label={t(`Удалить файл {v}`, { v: f.name ?? "" })} onClick={() => removeFile(f.id)}>
                <X size={13} />
              </button>
            </div>
          </DocTile>
        ))}
        {c.files.length < 6 && (
          <label className={s.addTile} title={t("PDF, JPG, PNG или\u00a0WebP, до\u00a010\u00a0МБ")}>
            <Plus size={18} aria-hidden />
            <span>{uploading ? t("Загружаем…") : t("Файл")}</span>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept="application/pdf,image/jpeg,image/png,image/webp"
              className={s.srOnly}
              disabled={uploading}
              onChange={(e) => upload(e.target.files)}
            />
          </label>
        )}
      </div>
      {c.files.length === 0 && c.kind !== "publication" && (
        <p className={s.hint}>
          <MessageCircleQuestion size={14} style={{ verticalAlign: "-2px" }} aria-hidden />{" "}{t("Без\u00a0скана сотрудник не\u00a0сможет подтвердить документ. PDF, JPG, PNG или\u00a0WebP, до\u00a010\u00a0МБ.")}
        </p>
      )}
      <DocViewer files={c.files} index={viewer} onClose={() => setViewer(null)} caption={c.title} />
    </article>
  );
}
