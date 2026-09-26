"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, Paperclip, ShieldCheck, X } from "lucide-react";
import { Button, Input, Modal, Select } from "@/ui";
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
}

const EMPTY: Form = { kind: "diploma", title: "", issuer: "", year: "", year_end: "", supervisor: "", hours: "", url: "", doi: "", number: "" };

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
});

export interface PickedFile {
  file: File;
  isPublic: boolean;
}

export function checkFile(f: File): string | null {
  if (f.size > CREDENTIAL_MAX_BYTES) return `«${f.name}» больше 10 МБ. Сожмите скан или разбейте на части.`;
  if (f.type && !CREDENTIAL_TYPES.includes(f.type)) return `«${f.name}»: подойдёт PDF, JPG, PNG или WebP.`;
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
    if (f.title.trim().length < 3) e.title = "Напишите название полностью";
    if (fields.issuer && !fields.issuer.includes("если есть") && !f.issuer.trim()) e.issuer = "Укажите организацию";
    if (fields.supervisor && !f.supervisor.trim()) e.supervisor = "Укажите супервизора";
    const year = f.year ? Number(f.year) : null;
    const yearEnd = f.year_end ? Number(f.year_end) : null;
    const now = new Date().getFullYear();
    if (year !== null && (!Number.isInteger(year) || year < 1950 || year > now + 1)) e.year = `Год от 1950 до ${now}`;
    if (yearEnd !== null && (!Number.isInteger(yearEnd) || yearEnd < (year ?? 1950) || yearEnd > now + 1)) e.year_end = "Не раньше начала";
    const hours = f.hours ? Number(f.hours) : null;
    if (hours !== null && (!Number.isInteger(hours) || hours < 1)) e.hours = "Целое число часов";
    if (!item && f.kind !== "publication" && !files.length && !f.url.trim()) e.files = "Приложите скан или фото документа: без него сотрудник не сможет проверить пункт";
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
      ...(fields.number ? { number: f.number.trim() } : {}),
    };
    setBusy(true);
    try {
      let saved = item ? await credentialsApi.update(item.id, body) : await credentialsApi.create(body);
      let warning: string | undefined;
      for (const p of files) {
        try {
          await credentialsApi.upload(saved.id, p.file, p.isPublic);
        } catch (err) {
          warning = err instanceof ApiError ? err.message : `Не получилось загрузить «${p.file.name}».`;
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
    <Modal open={open} onClose={() => !busy && onClose()} title={item ? "Изменить документ" : "Добавить документ"} width={600}>
      <div className={s.form}>
        <Select<CredentialKind>
          label="Что это"
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
        {fields.issuer && (
          <Input
            label={fields.issuer}
            value={f.issuer}
            maxLength={200}
            placeholder={fields.issuerPlaceholder}
            onChange={(e) => set("issuer", e.target.value)}
            error={errors.issuer}
          />
        )}
        {fields.supervisor && (
          <Input
            label="Супервизор"
            value={f.supervisor}
            maxLength={120}
            placeholder="Фамилия и инициалы"
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
              placeholder="Если ещё идёт, оставьте пустым"
              onChange={(e) => set("year_end", e.target.value.replace(/\D/g, ""))}
              error={errors.year_end}
            />
          ) : fields.hours ? (
            <Input
              label="Часов"
              inputMode="numeric"
              value={f.hours}
              maxLength={5}
              placeholder="Необязательно"
              onChange={(e) => set("hours", e.target.value.replace(/\D/g, ""))}
              error={errors.hours}
            />
          ) : (
            <span />
          )}
        </div>
        {fields.yearEnd && fields.hours && (
          <Input
            label="Часов"
            inputMode="numeric"
            value={f.hours}
            maxLength={5}
            placeholder="Например, 60"
            onChange={(e) => set("hours", e.target.value.replace(/\D/g, ""))}
            error={errors.hours}
          />
        )}
        {fields.number && (
          <Input
            label={fields.number}
            value={f.number}
            maxLength={60}
            placeholder="Необязательно"
            hint="Клиенты увидят только последние 4 символа. Полный номер знает только сотрудник, который проверяет документ."
            onChange={(e) => set("number", e.target.value)}
          />
        )}
        {fields.links && (
          <Input
            label="Ссылка"
            type="url"
            value={f.url}
            maxLength={500}
            placeholder="https://"
            hint={f.kind === "membership" ? "Страница в реестре ассоциации, если есть" : "Где можно прочитать или проверить"}
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
              <span>Приложить скан или фото: PDF, JPG, PNG, WebP до 10 МБ</span>
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
                  {p.isPublic ? "Показывать публично" : "Только для проверки"}
                </button>
                <button
                  type="button"
                  className={s.tileDel}
                  aria-label={`Убрать ${p.file.name}`}
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
            Файлы хранятся зашифрованными. Их видит только сотрудник, который проверяет документ. Клиентам покажем лишь те файлы,
            что вы отметили «Показывать публично», и только после проверки. Из фото удаляем геометку и данные камеры.
            {approvedEdit && " Если измените подтверждённый пункт, он снова уйдёт на проверку."}
          </span>
        </div>
        <div className={s.actions}>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Отмена
          </Button>
          <Button variant="primary" loading={busy} onClick={submit}>
            {item ? "Сохранить" : "Отправить на проверку"}
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
