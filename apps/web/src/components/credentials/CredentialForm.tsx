"use client";

import { t } from "@/lib/i18n";
import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, Paperclip, ShieldCheck, X } from "lucide-react";
import { Button, Combobox, Input, Modal, Select } from "@/ui";
import { UNIVERSITIES } from "@/lib/universities";
import { ApiError } from "@/lib/api/client";
import {
  CREDENTIAL_MAX_BYTES,
  CREDENTIAL_TYPES,
  KIND_LABEL,
  KIND_ORDER,
  credentialsApi,
  fileSize,
  type Credential,
  type CredentialInput,
  type CredentialKind,
} from "@/lib/api/credentials";
import { KIND_FIELDS, KIND_ICON } from "./kinds";
import s from "./credentials.module.css";

interface Form {
  kind: CredentialKind;
  title: string;
  issuer: string;
  year: string;
  year_end: string;
  supervisor: string;
  hours: string;
  url: string;
  doi: string;
  number: string;
  number_public: boolean;
}

const EMPTY: Form = { kind: "diploma", title: "", issuer: "", year: "", year_end: "", supervisor: "", hours: "", url: "", doi: "", number: "", number_public: false };

const fromItem = (c: Credential): Form => ({
  kind: c.kind,
  title: c.title,
  issuer: c.issuer,
  year: c.year ? String(c.year) : "",
  year_end: c.year_end ? String(c.year_end) : "",
  supervisor: c.supervisor,
  hours: c.hours ? String(c.hours) : "",
  url: c.url,
  doi: c.doi,
  number: c.number,
  number_public: c.number_public,
});

export interface PickedFile {
  file: File;
  isPublic: boolean;
}

export function checkFile(f: File): string | null {
  if (f.size > CREDENTIAL_MAX_BYTES) return t(`«{name}» больше 10\u00a0МБ. Сожмите скан или\u00a0разбейте на\u00a0части.`, { name: f.name });
  if (f.type && !CREDENTIAL_TYPES.includes(f.type)) return t(`«{name}»: подойдёт PDF, JPG, PNG или\u00a0WebP.`, { name: f.name });
  return null;
}

/** Add or edit one credential. New items can carry files; existing ones manage files in the list. */
export function CredentialForm({
  open,
  item,
  onClose,
  onSaved,
}: {
  open: boolean;
  item: Credential | null;
  onClose: () => void;
  onSaved: (c: Credential, warning?: string) => void;
}) {
  const [f, setF] = useState<Form>(EMPTY);
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [errors, setErrors] = useState<Partial<Record<keyof Form | "files", string>>>({});
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setF(item ? fromItem(item) : EMPTY);
    setFiles([]);
    setErrors({});
  }, [open, item]);

  const fields = KIND_FIELDS[f.kind];
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const approvedEdit = item?.status === "approved";

  const pick = (list: FileList | null) => {
    if (!list) return;
    const next = [...files];
    for (const file of Array.from(list)) {
      const err = checkFile(file);
      if (err) {
        setErrors((e) => ({ ...e, files: err }));
        continue;
      }
      if (next.length < 6) next.push({ file, isPublic: false });
    }
    setFiles(next);
    if (inputRef.current) inputRef.current.value = "";
  };

  const submit = async () => {
    const e: typeof errors = {};
    if (f.title.trim().length < 3) e.title = t("Напишите название полностью");
    if (fields.issuer && !fields.issuer.includes("если есть") && !f.issuer.trim()) e.issuer = t("Укажите организацию");
    if (fields.supervisor && !f.supervisor.trim()) e.supervisor = t("Укажите супервизора");
    const year = f.year ? Number(f.year) : null;
    const yearEnd = f.year_end ? Number(f.year_end) : null;
    const now = new Date().getFullYear();
    if (year !== null && (!Number.isInteger(year) || year < 1950 || year > now + 1)) e.year = t(`Год от\u00a01950\u00a0до\u00a0{now}`, { now });
    if (yearEnd !== null && (!Number.isInteger(yearEnd) || yearEnd < (year ?? 1950) || yearEnd > now + 1)) e.year_end = t("Не\u00a0раньше начала");
    const hours = f.hours ? Number(f.hours) : null;
    if (hours !== null && (!Number.isInteger(hours) || hours < 1)) e.hours = t("Целое число часов");
    if (!item && f.kind !== "publication" && !files.length && !f.url.trim()) e.files = t("Приложите скан или\u00a0фото документа: без\u00a0него сотрудник не\u00a0сможет проверить пункт");
    setErrors(e);
    if (Object.keys(e).length) return;

    const body: CredentialInput = {
      kind: f.kind,
      title: f.title.trim(),
      issuer: fields.issuer ? f.issuer.trim() : "",
      year,
      year_end: fields.yearEnd ? yearEnd : null,
      supervisor: fields.supervisor ? f.supervisor.trim() : "",
      hours: fields.hours ? hours : null,
      url: fields.links ? f.url.trim() : "",
      doi: f.kind === "publication" ? f.doi.trim() : "",
      ...(fields.number ? { number: f.number.trim(), number_public: f.number_public && !!f.number.trim() } : {}),
    };
    setBusy(true);
    try {
      let saved = item ? await credentialsApi.update(item.id, body) : await credentialsApi.create(body);
      let warning: string | undefined;
      for (const p of files) {
        try {
          await credentialsApi.upload(saved.id, p.file, p.isPublic);
        } catch (err) {
          warning = err instanceof ApiError ? err.message : t(`Не\u00a0получилось загрузить «{name}».`, { name: p.file.name });
        }
      }
      if (files.length) saved = (await credentialsApi.mine()).find((x) => x.id === saved.id) ?? saved;
      onSaved(saved, warning);
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) {
        const fe: typeof errors = {};
        for (const [k, v] of Object.entries(err.fields)) if (k in f) fe[k as keyof Form] = v[0];
        setErrors(fe);
      } else {
        setErrors({ files: (err as Error).message });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={() => !busy && onClose()} title={item ? t("Изменить документ") : t("Добавить документ")} width={600}>
      <div className={s.form}>
        <Select<CredentialKind>
          label={t("Что\u00a0это")}
          value={f.kind}
          onChange={(v) => set("kind", v)}
          disabled={!!item}
          icon={<KindGlyph kind={f.kind} />}
          options={KIND_ORDER.map((k) => ({ value: k, label: KIND_LABEL[k] }))}
          hint={fields.hint}
        />
        <Input
          label={fields.title}
          value={f.title}
          maxLength={200}
          placeholder={fields.titlePlaceholder}
          onChange={(e) => set("title", e.target.value)}
          error={errors.title}
        />
        {fields.issuer && (f.kind === "publication" ? (
          <Input
            label={fields.issuer}
            value={f.issuer}
            maxLength={200}
            placeholder={fields.issuerPlaceholder}
            onChange={(e) => set("issuer", e.target.value)}
            error={errors.issuer}
          />
        ) : (
          // universities, institutes and associations are suggested while typing; any text is accepted
          <Combobox
            label={fields.issuer}
            value={f.issuer}
            options={UNIVERSITIES}
            maxLength={200}
            placeholder={fields.issuerPlaceholder}
            onChange={(v) => set("issuer", v)}
            error={errors.issuer}
          />
        ))}
        {fields.supervisor && (
          <Input
            label={t("Супервизор")}
            value={f.supervisor}
            maxLength={120}
            placeholder={t("Фамилия и\u00a0инициалы")}
            onChange={(e) => set("supervisor", e.target.value)}
            error={errors.supervisor}
          />
        )}
        <div className={s.formRow}>
          <Input
            label={fields.year}
            inputMode="numeric"
            value={f.year}
            maxLength={4}
            placeholder={String(new Date().getFullYear() - 3)}
            onChange={(e) => set("year", e.target.value.replace(/\D/g, ""))}
            error={errors.year}
          />
          {fields.yearEnd ? (
            <Input
              label={fields.yearEnd}
              inputMode="numeric"
              value={f.year_end}
              maxLength={4}
              placeholder={t("Если ещё идёт, оставьте пустым")}
              onChange={(e) => set("year_end", e.target.value.replace(/\D/g, ""))}
              error={errors.year_end}
            />
          ) : fields.hours ? (
            <Input
              label={t("Часов")}
              inputMode="numeric"
              value={f.hours}
              maxLength={5}
              placeholder={t("Необязательно")}
              onChange={(e) => set("hours", e.target.value.replace(/\D/g, ""))}
              error={errors.hours}
            />
          ) : (
            <span />
          )}
        </div>
        {fields.yearEnd && fields.hours && (
          <Input
            label={t("Часов")}
            inputMode="numeric"
            value={f.hours}
            maxLength={5}
            placeholder={t("Например, 60")}
            onChange={(e) => set("hours", e.target.value.replace(/\D/g, ""))}
            error={errors.hours}
          />
        )}
        {fields.number && (
          <Input
            label={fields.number}
            value={f.number}
            maxLength={60}
            placeholder={t("Необязательно")}
            hint={
              f.number_public
                ? t("Клиенты увидят номер полностью и смогут сами проверить документ.")
                : t("Клиенты увидят только последние 4 символа. Полный номер знает сотрудник, который проверяет документ.")
            }
            onChange={(e) => set("number", e.target.value)}
          />
        )}
        {fields.number && f.number.trim() && (
          <label className={s.check}>
            <input type="checkbox" checked={f.number_public} onChange={(e) => set("number_public", e.target.checked)} />
            {t("Показывать номер клиентам полностью")}
          </label>
        )}
        {fields.links && (
          <Input
            label={t("Ссылка")}
            type="url"
            value={f.url}
            maxLength={500}
            placeholder="https://"
            hint={f.kind === "membership" ? t("Страница в\u00a0реестре ассоциации, если есть") : t("Где можно прочитать или\u00a0проверить")}
            onChange={(e) => set("url", e.target.value)}
            error={errors.url}
          />
        )}
        {f.kind === "publication" && (
          <Input
            label="DOI"
            value={f.doi}
            maxLength={120}
            placeholder="10.1037/abc0000123"
            onChange={(e) => set("doi", e.target.value)}
            error={errors.doi}
          />
        )}

        {!item && (
          <div className={s.picked}>
            <label className={s.addTile} style={{ width: "100%", height: "auto", minHeight: 72, gridAutoFlow: "column", justifyContent: "center", gap: 10 }}>
              <Paperclip size={18} aria-hidden />
              <span>{t("Приложить скан или\u00a0фото: PDF, JPG, PNG, WebP до\u00a010\u00a0МБ")}</span>
              <input
                ref={inputRef}
                type="file"
                multiple
                accept="application/pdf,image/jpeg,image/png,image/webp"
                className={s.srOnly}
                onChange={(e) => pick(e.target.files)}
              />
            </label>
            {files.map((p, i) => (
              <div key={`${p.file.name}-${i}`} className={s.pickedRow}>
                <span>{p.file.name}</span>
                <span className={s.hint}>{fileSize(p.file.size)}</span>
                <button
                  type="button"
                  className={s.vis}
                  data-on={p.isPublic || undefined}
                  aria-pressed={p.isPublic}
                  onClick={() => setFiles((xs) => xs.map((x, j) => (j === i ? { ...x, isPublic: !x.isPublic } : x)))}
                >
                  {p.isPublic ? <Eye size={13} /> : <EyeOff size={13} />}
                  {p.isPublic ? t("Показывать публично") : t("Только для\u00a0проверки")}
                </button>
                <button
                  type="button"
                  className={s.tileDel}
                  aria-label={t(`Убрать {name}`, { name: p.file.name })}
                  onClick={() => setFiles((xs) => xs.filter((_, j) => j !== i))}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            {errors.files && <p className={s.hint} style={{ color: "var(--c-danger)" }}>{errors.files}</p>}
          </div>
        )}
        {item && errors.files && <p className={s.hint} style={{ color: "var(--c-danger)" }}>{errors.files}</p>}

        <div className={s.privacy}>
          <ShieldCheck size={18} aria-hidden />
          <span>
            {t("Файлы хранятся зашифрованными. Их\u00a0видит только сотрудник, который проверяет документ. Клиентам покажем лишь те\u00a0файлы, что\u00a0вы\u00a0отметили «Показывать публично», и\u00a0только после проверки. Из\u00a0фото удаляем геометку и\u00a0данные камеры.")}
            {approvedEdit && t(" Если измените подтверждённый пункт, он\u00a0снова уйдёт на\u00a0проверку.")}
          </span>
        </div>
        <div className={s.actions}>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t("Отмена")}
          </Button>
          <Button variant="primary" loading={busy} onClick={submit}>
            {item ? t("Сохранить") : t("Отправить на\u00a0проверку")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function KindGlyph({ kind }: { kind: CredentialKind }) {
  const Icon = KIND_ICON[kind].icon;
  return <Icon size={18} strokeWidth={1.8} aria-hidden />;
}
