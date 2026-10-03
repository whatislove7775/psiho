"use client";

import { t, tj } from "@/lib/i18n";
import { useState } from "react";
import { Building2, KeyRound, ShieldCheck } from "lucide-react";
import { Button, CollapsibleCard, Input, Skeleton, useToast } from "@/ui";
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
  // Never promise more than the company budget can actually cover
  const rubLeft = p.available_kopecks != null ? p.available_kopecks : p.rub_left_kopecks;
  if (rubLeft !== null) parts.push(rubK(rubLeft));
  if (p.calls_left !== null) parts.push(`${p.calls_left} ${plural(p.calls_left, "созвон", "созвона", "созвонов")}`);
  const left = parts.length ? parts.join(t(" и ")) : t("без\u00a0лимита");
  const until = p.renews_on ? t(`до\u00a0{dateRu}`, { dateRu: dateRu(p.renews_on) }) : p.expires_on ? t(`до\u00a0{dateRu}`, { dateRu: dateRu(p.expires_on) }) : "";
  return t(`Осталось {left}{v}`, { left, v: until ? ` ${until}` : "" });
}

function ProgramRow({ p }: { p: MyProgram }) {
  const limits: string[] = [];
  if (p.amount_kopecks !== null) limits.push(rubK(p.amount_kopecks));
  if (p.calls_limit !== null) limits.push(`${p.calls_limit} ${plural(p.calls_limit, "созвон", "созвона", "созвонов")}`);
  const rubLeft = p.available_kopecks != null ? p.available_kopecks : p.rub_left_kopecks;
  const pct =
    p.amount_kopecks && rubLeft !== null
      ? rubLeft / p.amount_kopecks
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
            {limits.join(t(" и "))}{" "}{t("в")}{" "}{PERIOD_LABEL[p.period]}
          </span>
        </span>
      </div>
      {p.budget_ok ? (
        <>
          <div className={s.allowanceLeft}>{allowanceText(p)}</div>
          <div className={s.meter} role="presentation">
            <span style={{ width: `${Math.max(0, Math.min(1, pct)) * 100}%` }} />
          </div>
        </>
      ) : (
        <div className={s.allowanceLeft}>{t("Компания ещё не\u00a0пополнила бюджет\u00a0— пока созвоны оплачиваются с\u00a0вашего баланса")}</div>
      )}
      {p.expires_on && p.renews_on && <div className={b.hint}>{tj("Программа действует до {dateRu}.", { dateRu: dateRu(p.expires_on, { day: "numeric", month: "long", year: "numeric" }) })}</div>}
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
      toast(t("Программа компании подключена"));
      notifyBalanceChanged();
      onChanged?.();
    } catch (err) {
      setError(err instanceof ApiError ? (err.status === 429 ? t("Слишком много попыток. Подождите минуту.") : err.message) : t("Не\u00a0получилось проверить код."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <CollapsibleCard
      key={programs.length ? "on" : "off"}
      title={programs.length ? t("Программа компании") : t("Код от\u00a0работодателя")}
      icon={<Building2 size={18} />}
      defaultOpen={programs.length > 0}
    >
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
            aria-label={t("Код от\u00a0работодателя")}
            autoComplete="off"
            spellCheck={false}
            maxLength={24}
            error={error ?? undefined}
          />
          <Button type="submit" variant="soft" icon={<KeyRound size={18} />} loading={busy} disabled={!code.trim()}>
            {programs.length ? t("Добавить ещё код") : t("Активировать код")}
          </Button>
        </form>
        <div className={s.anonNote}>
          <ShieldCheck size={16} aria-hidden />
          <span>{t("Компания не\u00a0узнает, что\u00a0это\u00a0вы.")}</span>
        </div>
      </div>
    </CollapsibleCard>
  );
}
