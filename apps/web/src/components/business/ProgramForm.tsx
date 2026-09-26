"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Button, Input, Segmented } from "@/ui";
import { ApiError } from "@/lib/api/client";
import { SERVICE_LABEL, type Period, type Program, type ProgramInput, type Service } from "@/lib/api/business";
import s from "./business.module.css";

const SERVICES: Service[] = ["calls", "circles", "ai"];

/** Program settings (HR portal and staff console share it). */
export function ProgramForm({
  program,
  onSave,
  submitLabel = "Сохранить",
  withStart = false,
}: {
  program: Program | null;
  onSave: (body: ProgramInput) => Promise<unknown>;
  submitLabel?: string;
  withStart?: boolean;
}) {
  const [name, setName] = useState(program?.name ?? "Забота о сотрудниках");
  const [amount, setAmount] = useState(program?.amount_kopecks ? String(program.amount_kopecks / 100) : "");
  const [calls, setCalls] = useState(program?.calls_limit ? String(program.calls_limit) : "");
  const [period, setPeriod] = useState<Period>(program?.period ?? "month");
  const [services, setServices] = useState<Service[]>(program?.services ?? ["calls"]);
  const [starts, setStarts] = useState(program?.starts_on ?? "");
  const [expires, setExpires] = useState(program?.expires_on ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (x: Service) => setServices((v) => (v.includes(x) ? v.filter((y) => y !== x) : [...v, x]));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body: ProgramInput = {
        name,
        amount_rub: amount ? Number(amount.replace(/\s/g, "")) : null,
        calls_limit: calls ? Number(calls) : null,
        period,
        services,
        expires_on: expires || null,
      };
      if (withStart) body.starts_on = starts || null;
      await onSave(body);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не получилось сохранить.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className={s.form} onSubmit={submit}>
      <Input label="Название" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
      <div>
        <div className={s.muted} style={{ marginBottom: 8, fontWeight: 600 }}>
          Период лимита
        </div>
        <Segmented<Period>
          ariaLabel="Период лимита"
          value={period}
          onChange={setPeriod}
          options={[
            { value: "month", label: "Месяц" },
            { value: "quarter", label: "Квартал" },
            { value: "year", label: "Год" },
          ]}
        />
      </div>
      <div className={s.form2}>
        <Input
          label="Сумма на сотрудника, ₽"
          hint="Пусто — без лимита по сумме"
          inputMode="numeric"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d\s]/g, ""))}
          placeholder="5 000"
        />
        <Input
          label="Созвонов на сотрудника"
          hint="Пусто — без лимита по количеству"
          inputMode="numeric"
          value={calls}
          onChange={(e) => setCalls(e.target.value.replace(/\D/g, ""))}
          placeholder="4"
        />
      </div>
      <div>
        <div className={s.muted} style={{ marginBottom: 8, fontWeight: 600 }}>
          Что оплачивает программа
        </div>
        <div className={s.chips}>
          {SERVICES.map((x) => (
            <button key={x} type="button" className={s.chip} aria-pressed={services.includes(x)} onClick={() => toggle(x)}>
              {services.includes(x) && <Check size={16} aria-hidden />}
              {SERVICE_LABEL[x]}
            </button>
          ))}
        </div>
      </div>
      <div className={s.form2}>
        {withStart && <Input label="Начало" type="date" value={starts} onChange={(e) => setStarts(e.target.value)} />}
        <Input label="Действует до" hint="Пусто — бессрочно" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
      </div>
      {error && (
        <div className={s.muted} role="alert" style={{ color: "var(--c-danger)" }}>
          {error}
        </div>
      )}
      <div>
        <Button type="submit" variant="primary" loading={busy}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
