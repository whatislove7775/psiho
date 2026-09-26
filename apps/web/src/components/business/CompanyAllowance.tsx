"use client";

import { useState } from "react";
import { Building2, KeyRound, ShieldCheck } from "lucide-react";
import { Button, Card, CardHead, Input, Skeleton, useToast } from "@/ui";
import { ApiError } from "@/lib/api/client";
import { businessApi, dateRu, PERIOD_LABEL, type MyProgram } from "@/lib/api/business";
import { notifyBalanceChanged, rubK } from "@/lib/api/billing";
import { useLoad } from "@/components/client/useLoad";
import { plural } from "@/lib/format";
import b from "@/components/billing/billing.module.css";
import s from "./business.module.css";

/** «осталось 3 000 ₽ и 2 созвона до 1 ноября» */
export function allowanceText(p: MyProgram): string {
  const parts: string[] = [];
  if (p.rub_left_kopecks !== null) parts.push(rubK(p.rub_left_kopecks));
  if (p.calls_left !== null) parts.push(`${p.calls_left} ${plural(p.calls_left, "созвон", "созвона", "созвонов")}`);
  const left = parts.length ? parts.join(" и ") : "без лимита";
  const until = p.renews_on ? `до ${dateRu(p.renews_on)}` : p.expires_on ? `до ${dateRu(p.expires_on)}` : "";
  return `Осталось ${left}${until ? ` ${until}` : ""}`;
}

function ProgramRow({ p }: { p: MyProgram }) {
  const limits: string[] = [];
  if (p.amount_kopecks !== null) limits.push(rubK(p.amount_kopecks));
  if (p.calls_limit !== null) limits.push(`${p.calls_limit} ${plural(p.calls_limit, "созвон", "созвона", "созвонов")}`);
  const pct =
    p.amount_kopecks && p.rub_left_kopecks !== null
      ? p.rub_left_kopecks / p.amount_kopecks
      : p.calls_limit && p.calls_left !== null
        ? p.calls_left / p.calls_limit
        : 1;
  return (
    <div className={s.allowance}>
      <div className={s.allowanceHead}>
        <span className={s.allowanceIcon} aria-hidden>
          <Building2 size={18} />
        </span>
        <span className={s.allowanceMain}>
          <span className={s.allowanceTitle}>{p.company}</span>
          <span className={s.allowanceSub}>
            {limits.join(" и ")} в {PERIOD_LABEL[p.period]}
          </span>
        </span>
      </div>
      <div className={s.allowanceLeft}>{allowanceText(p)}</div>
      <div className={s.meter} role="presentation">
        <span style={{ width: `${Math.max(0, Math.min(1, pct)) * 100}%` }} />
      </div>
      {!p.budget_ok && <div className={b.hint}>Бюджет компании на этот период закончился. Созвоны пока оплачиваются с баланса.</div>}
      {p.expires_on && p.renews_on && <div className={b.hint}>Программа действует до {dateRu(p.expires_on, { day: "numeric", month: "long", year: "numeric" })}.</div>}
    </div>
  );
}

/** Balance page card: company programs of this anonymous account + redeem an employee code. */
export function CompanyAllowance({ onChanged }: { onChanged?: () => void }) {
  const toast = useToast();
  const mine = useLoad(() => businessApi.mine(), []);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const programs = mine.data?.programs ?? [];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await businessApi.redeem(code);
      mine.setData(r);
      setCode("");
      toast("Программа компании подключена");
      notifyBalanceChanged();
      onChanged?.();
    } catch (err) {
      setError(err instanceof ApiError ? (err.status === 429 ? "Слишком много попыток. Подождите минуту." : err.message) : "Не получилось проверить код.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card as="section">
      <CardHead
        title="Программа компании"
        icon={<Building2 size={18} />}
        sub={programs.length ? "Оплачивает созвоны первой, потом — баланс" : "Если работодатель выдал код"}
      />
      <div className={b.stack}>
        {mine.loading && !mine.data ? (
          <Skeleton height={96} radius={16} />
        ) : (
          programs.map((p) => <ProgramRow key={p.id} p={p} />)
        )}
        <form className={b.stack} onSubmit={submit}>
          <Input
            className={b.codeInput}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="BIZ-XXXX-XXXX-XXXX"
            aria-label="Код от работодателя"
            autoComplete="off"
            spellCheck={false}
            maxLength={24}
            error={error ?? undefined}
          />
          <Button type="submit" variant="soft" icon={<KeyRound size={18} />} loading={busy} disabled={!code.trim()}>
            {programs.length ? "Добавить ещё код" : "Активировать код"}
          </Button>
        </form>
        <div className={s.anonNote}>
          <ShieldCheck size={16} aria-hidden />
          <span>Компания не узнает, что код активировали именно вы. Она видит только общие цифры по всем сотрудникам.</span>
        </div>
      </div>
    </Card>
  );
}
