"use client";

import { t } from "@/lib/i18n";
import { useState } from "react";
import { CheckCircle2, Send } from "lucide-react";
import { Button, Input, Textarea } from "@/ui";
import { ApiError } from "@/lib/api/client";
import { businessApi } from "@/lib/api/business";
import s from "./biz.module.css";

/** «Рассчитать для компании» → staff inbox (/admin/business, «Заявки»). */
export function LeadForm() {
  const [company, setCompany] = useState("");
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [employees, setEmployees] = useState("");
  const [message, setMessage] = useState("");
  const [trap, setTrap] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await businessApi.lead({
        company_name: company,
        contact_name: name,
        contact,
        employees: employees ? Number(employees) : null,
        message,
        website: trap,
      });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? (err.status === 429 ? t("Слишком много заявок подряд. Попробуйте позже.") : err.message) : t("Не\u00a0получилось отправить."));
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div className={s.sent} role="status">
        <CheckCircle2 size={28} aria-hidden />
        <div>
          <strong>{t("Заявка у\u00a0нас")}</strong>
          <p>{t("Менеджер свяжется в\u00a0течение рабочего дня и\u00a0пришлёт расчёт под\u00a0размер вашей команды.")}</p>
        </div>
      </div>
    );
  }

  return (
    <form className={s.form} onSubmit={submit} noValidate>
      <div className={s.formRow}>
        <Input label={t("Компания")} value={company} onChange={(e) => setCompany(e.target.value)} autoComplete="organization" maxLength={160} required />
        <Input
          label={t("Сотрудников")}
          inputMode="numeric"
          value={employees}
          onChange={(e) => setEmployees(e.target.value.replace(/\D/g, "").slice(0, 7))}
          placeholder={t("Например, 250")}
        />
      </div>
      <div className={s.formRow}>
        <Input label={t("Как\u00a0к\u00a0вам обращаться")} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={120} />
        <Input label={t("Рабочий email или\u00a0телефон")} value={contact} onChange={(e) => setContact(e.target.value)} autoComplete="email" maxLength={160} required />
      </div>
      <Textarea label={t("Комментарий")} value={message} onChange={(e) => setMessage(e.target.value)} rows={3} maxLength={2000} placeholder={t("Что\u00a0важно: пилот на\u00a0отдел, лимиты, сроки")} />
      <input className={s.trap} tabIndex={-1} autoComplete="off" aria-hidden value={trap} onChange={(e) => setTrap(e.target.value)} name="website" />
      {error && (
        <div className={s.error} role="alert">
          {error}
        </div>
      )}
      <div className={s.formFoot}>
        <Button type="submit" variant="primary" size="lg" icon={<Send size={18} />} loading={busy} disabled={!company.trim() || !contact.trim()}>
          {t("Получить расчёт")}
        </Button>
        <span className={s.formNote}>{t("Контакты компании нужны только для\u00a0договора. Данных сотрудников мы\u00a0не\u00a0просим.")}</span>
      </div>
    </form>
  );
}
