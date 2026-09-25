"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Badge, Button, Modal, Textarea } from "@/ui";
import { STAFF_ROLE_LABEL, type StaffRole } from "@/lib/api/staff";
import { plural } from "@/lib/format";
import s from "./staff.module.css";

/** "24 сент., 18:05" */
export function dateTime(iso: string | null | undefined): string {
  if (!iso) return "нет данных";
  return new Date(iso).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** "24 сент. 2026" */
export function dateOnly(iso: string | null | undefined): string {
  if (!iso) return "нет данных";
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" });
}

export function ago(iso: string | null | undefined): string {
  if (!iso) return "никогда";
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "только что";
  if (min < 60) return `${min} ${plural(min, "минуту", "минуты", "минут")} назад`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} ${plural(h, "час", "часа", "часов")} назад`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} ${plural(d, "день", "дня", "дней")} назад`;
  return dateOnly(iso);
}

/** Debounced value for search boxes. */
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className={s.toolbar}>{children}</div>;
}

export function SearchBox({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  label: string;
}) {
  return (
    <label className={s.search}>
      <Search size={18} aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        autoCapitalize="off"
        spellCheck={false}
      />
    </label>
  );
}

export function SelectBox<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
}) {
  return (
    <select className={s.select} value={value} onChange={(e) => onChange(e.target.value as T)} aria-label={label}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Pager({
  page,
  pages,
  count,
  onPage,
  noun,
}: {
  page: number;
  pages: number;
  count: number;
  onPage: (p: number) => void;
  noun: [string, string, string];
}) {
  return (
    <div className={s.pager}>
      <span>
        {count} {plural(count, ...noun)}
      </span>
      {pages > 1 && (
        <div className={s.pagerNav}>
          <Button size="sm" variant="ghost" iconOnly aria-label="Предыдущая страница" disabled={page <= 1} onClick={() => onPage(page - 1)} icon={<ChevronLeft size={18} />} />
          <span className={s.pagerLabel}>
            {page} из {pages}
          </span>
          <Button size="sm" variant="ghost" iconOnly aria-label="Следующая страница" disabled={page >= pages} onClick={() => onPage(page + 1)} icon={<ChevronRight size={18} />} />
        </div>
      )}
    </div>
  );
}

export function RoleBadge({ role }: { role: StaffRole | null | undefined }) {
  if (!role) return null;
  const tone = role === "owner" ? "primary" : role === "admin" ? "success" : "neutral";
  return <Badge tone={tone}>{STAFF_ROLE_LABEL[role] ?? role}</Badge>;
}

export function KV({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className={s.kv}>
      {items.map(([k, v], i) => (
        <div key={i}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Confirmation dialog with a required (or optional) reason field. */
export function ReasonModal({
  open,
  title,
  text,
  confirm,
  variant = "primary",
  reasonLabel = "Причина",
  reasonHint,
  requireReason = true,
  busy,
  onClose,
  onConfirm,
  children,
}: {
  open: boolean;
  title: string;
  text?: ReactNode;
  confirm: string;
  variant?: "primary" | "danger";
  reasonLabel?: string;
  reasonHint?: string;
  requireReason?: boolean;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  children?: ReactNode;
}) {
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (open) setReason("");
  }, [open]);
  const ok = !requireReason || reason.trim().length >= 3;
  return (
    <Modal open={open} onClose={() => !busy && onClose()} title={title}>
      {text && <p className={s.modalText}>{text}</p>}
      {children}
      <Textarea
        label={reasonLabel}
        hint={reasonHint ?? (requireReason ? "Попадёт в журнал действий. Минимум 3 символа." : "Необязательно. Попадёт в журнал действий.")}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={3}
        maxLength={500}
      />
      <div className={s.modalActions}>
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Не менять
        </Button>
        <Button variant={variant} loading={busy} disabled={!ok} onClick={() => onConfirm(reason.trim())}>
          {confirm}
        </Button>
      </div>
    </Modal>
  );
}

export function HealthDot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={s.health} data-ok={ok || undefined}>
      <span className={s.healthDot} aria-hidden />
      {label}
    </span>
  );
}

/** Russian labels for audit actions. Unknown actions fall back to the raw code. */
export const ACTION_LABEL: Record<string, string> = {
  "user.block": "Заблокировал аккаунт",
  "user.unblock": "Разблокировал аккаунт",
  "user.force_logout": "Завершил сеансы",
  "specialist.approve": "Одобрил специалиста",
  "specialist.reject": "Отклонил заявку",
  "specialist.suspend": "Приостановил специалиста",
  "specialist.reinstate": "Вернул специалиста в каталог",
  "specialist.edit": "Изменил профиль специалиста",
  "specialist.verify_legacy": "Сменил статус специалиста",
  "session.cancel": "Отменил созвон",
  "session.refund": "Оформил возврат",
  "report.assign": "Взял жалобу в работу",
  "report.resolved": "Решил жалобу",
  "report.dismissed": "Отклонил жалобу",
  "staff.create": "Добавил сотрудника",
  "staff.update": "Изменил роль сотрудника",
  "staff.deactivate": "Отключил сотрудника",
  "staff.activate": "Вернул доступ сотруднику",
  "staff.reset_password": "Сбросил пароль сотрудника",
  "staff.reset_2fa": "Сбросил 2FA сотрудника",
  "staff.me.password_changed": "Сменил свой пароль",
  "staff.me.totp_enabled": "Включил 2FA",
  "staff.me.totp_disabled": "Выключил 2FA",
  "auth.staff_login": "Вошёл в консоль",
  "auth.staff_login_failed": "Неверный код 2FA при входе",
  "lab.room.create": "Создал тестовую комнату",
  "lab.room.close": "Закрыл тестовую комнату",
};

export const actionLabel = (a: string) => ACTION_LABEL[a] ?? a;
