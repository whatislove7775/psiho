"use client";

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
      setError(err instanceof ApiError ? (err.status === 429 ? "Слишком много заявок подряд. Попробуйте позже." : err.message) : "Не получилось отправить.");
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div className={s.sent} role="status">
        <CheckCircle2 size={28} aria-hidden />
        <div>
          <strong>Заявка у нас</strong>
          <p>Менеджер свяжется в течение рабочего дня и пришлёт расчёт под размер вашей команды.</p>
        </div>
      </div>
    );
  }

  return (
    <form className={s.form} onSubmit={submit} noValidate>
      <div className={s.formRow}>
        <Input label="Компания" value={company} onChange={(e) => setCompany(e.target.value)} autoComplete="organization" maxLength={160} required />
        <Input
          label="Сотрудников"
          inputMode="numeric"
          value={employees}
          onChange={(e) => setEmployees(e.target.value.replace(/\D/g, "").slice(0, 7))}
          placeholder="Например, 250"
        />
      </div>
      <div className={s.formRow}>
        <Input label="Как к вам обращаться" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={120} />
        <Input label="Рабочий email или телефон" value={contact} onChange={(e) => setContact(e.target.value)} autoComplete="email" maxLength={160} required />
      </div>
      <Textarea label="Комментарий" value={message} onChange={(e) => setMessage(e.target.value)} rows={3} maxLength={2000} placeholder="Что важно: пилот на отдел, лимиты, сроки" />
      <input className={s.trap} tabIndex={-1} autoComplete="off" aria-hidden value={trap} onChange={(e) => setTrap(e.target.value)} name="website" />
      {error && (
        <div className={s.error} role="alert">
          {error}
        </div>
      )}
      <div className={s.formFoot}>
        <Button type="submit" variant="primary" size="lg" icon={<Send size={18} />} loading={busy} disabled={!company.trim() || !contact.trim()}>
          Получить расчёт
        </Button>
        <span className={s.formNote}>Контакты компании нужны только для договора. Данных сотрудников мы не просим.</span>
      </div>
    </form>
  );
}
