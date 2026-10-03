"use client";

import { t as tt, tj } from "@/lib/i18n";
import { useApprox } from "@/lib/i18n/currency";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, FlaskConical, Lock } from "lucide-react";
import { Button, Input } from "@/ui";
import { ApiError } from "@/lib/api/client";
import { billingApi, rubK, type TopUp, type TopUpSettings } from "@/lib/api/billing";
import s from "./billing.module.css";
import { ConsentNote } from "@/components/legal/ConsentNote";

type ReceiptMode = "none" | "email" | "phone";

declare global {
  interface Window {
    YooMoneyCheckoutWidget?: new (opts: Record<string, unknown>) => { render: (id: string) => Promise<void>; destroy: () => void };
  }
}

/**
 * Top up the anonymous balance: preset or custom amount, payment method,
 * optional contact for the fiscal receipt (sent to YooKassa only, never stored).
 * Redirects to the provider (or our test checkout), or renders the YooKassa widget.
 */
export function TopUpForm({
  settings,
  suggestRub,
  returnTo,
  onDone,
}: {
  settings: TopUpSettings;
  /** preselected amount, e.g. the shortfall for a call */
  suggestRub?: number;
  /** our page to come back to after paying (must start with /app/) */
  returnTo?: string;
  onDone?: (t: TopUp) => void;
}) {
  const approx = useApprox();
  const min = settings.min_kopecks / 100;
  const max = settings.max_kopecks / 100;
  const initial = useMemo(() => {
    if (suggestRub) return Math.min(max, Math.max(min, Math.ceil(suggestRub / 100) * 100));
    return settings.presets_rub[1] ?? settings.presets_rub[0] ?? 1000;
  }, [suggestRub, settings, min, max]);
  const [amount, setAmount] = useState<string>(String(initial));
  const [method, setMethod] = useState(settings.methods[0]?.id ?? "any");
  const [receipt, setReceipt] = useState<ReceiptMode>(settings.receipts.required ? "email" : "none");
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [widgetToken, setWidgetToken] = useState<string | null>(null);
  const widgetRef = useRef<{ destroy: () => void } | null>(null);

  useEffect(() => setAmount(String(initial)), [initial]);

  const value = Number(amount.replace(/\s/g, "").replace(",", "."));
  const valid = Number.isFinite(value) && value >= min && value <= max;
  const presets = suggestRub && !settings.presets_rub.includes(initial) ? [initial, ...settings.presets_rub] : settings.presets_rub;

  useEffect(() => {
    if (!widgetToken) return;
    let cancelled = false;
    const start = () => {
      if (cancelled || !window.YooMoneyCheckoutWidget) return;
      const w = new window.YooMoneyCheckoutWidget({
        confirmation_token: widgetToken,
        return_url: `${window.location.origin}${returnTo ?? "/app/balance"}`,
        error_callback: () => setError(tt("Платёжная форма не\u00a0загрузилась. Обновите страницу.")),
      });
      widgetRef.current = w;
      w.render("yookassa-widget");
    };
    if (window.YooMoneyCheckoutWidget) start();
    else {
      const sc = document.createElement("script");
      sc.src = "https://yookassa.ru/checkout-widget/v1/checkout-widget.js";
      sc.onload = start;
      sc.onerror = () => setError(tt("Платёжная форма не\u00a0загрузилась. Проверьте интернет."));
      document.head.appendChild(sc);
    }
    return () => {
      cancelled = true;
      widgetRef.current?.destroy();
    };
  }, [widgetToken, returnTo]);

  const submit = async () => {
    if (!valid) {
      setError(tt(`Сумма\u00a0— от\u00a0{rubK} до\u00a0{rubK2}.`, { rubK: rubK(settings.min_kopecks), rubK2: rubK(settings.max_kopecks) }));
      return;
    }
    if (receipt !== "none" && !contact.trim()) {
      setError(receipt === "email" ? tt("Укажите email для\u00a0чека или\u00a0выберите «Без\u00a0чека на\u00a0почту».") : tt("Укажите телефон для\u00a0чека."));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const t = await billingApi.createTopUp({
        amount_rub: value,
        method,
        receipt_email: receipt === "email" ? contact.trim() : undefined,
        receipt_phone: receipt === "phone" ? contact.trim() : undefined,
        return_to: returnTo,
      });
      onDone?.(t);
      const c = t.confirmation;
      if (c?.type === "embedded" && c.token) {
        setWidgetToken(c.token);
        setBusy(false);
        return;
      }
      if (c?.url) {
        window.location.href = c.url;
        return;
      }
      setError(tt("Платёжный сервис не\u00a0вернул ссылку. Попробуйте ещё раз."));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : tt("Не\u00a0получилось начать оплату. Попробуйте ещё раз."));
    }
    setBusy(false);
  };

  if (widgetToken) {
    return (
      <div className={s.stack}>
        <div id="yookassa-widget" className={s.widget} />
        {error && (
          <div className={s.error} role="alert">
            <AlertCircle size={16} aria-hidden /> {error}
          </div>
        )}
      </div>
    );
  }

  if (settings.providers.length === 0) {
    return (
      <div className={s.testNote}>
        <AlertCircle size={16} aria-hidden />
        <span>
          {tt("Пополнение картой и\u00a0через СБП скоро появится. Сейчас баланс можно пополнить подарочным кодом\u00a0— поле для\u00a0кода ниже на\u00a0этой странице.")}
        </span>
      </div>
    );
  }

  return (
    <div className={s.stack}>
      {settings.test_mode && (
        <div className={s.testNote}>
          <FlaskConical size={16} aria-hidden />
          <span>{tt("Тестовый режим: оплата проходит на\u00a0нашей тестовой странице, настоящие деньги не\u00a0списываются.")}</span>
        </div>
      )}

      <div>
        <div className={s.label} id="topup-amount">
          {tt("Сумма")}
        </div>
        <div className={s.presets} role="group" aria-labelledby="topup-amount">
          {presets.map((p) => (
            <button key={p} type="button" className={s.preset} aria-pressed={value === p} onClick={() => setAmount(String(p))}>
              {rubK(p * 100)}
            </button>
          ))}
        </div>
      </div>

      <label className={s.amountField}>
        <input
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d\s,.]/g, ""))}
          aria-label={tt("Другая сумма, рублей")}
        />
        <span aria-hidden>₽</span>
      </label>
      <div className={s.hint}>
        {tj("От {rubK} до {rubK2} за\u00a0раз.", { rubK: rubK(settings.min_kopecks), rubK2: rubK(settings.max_kopecks) })}
        {approx && valid && value ? ` ${approx(value)}.` : ""}
      </div>
      {approx && (
        // Visitors from other countries: prices and payments are in roubles (YooKassa); see docs/INTERNATIONAL.md
        <div className={s.hint}>
          {tt("Оплата только в\u00a0рублях, банк пересчитает по\u00a0своему курсу. Карты, выпущенные не\u00a0в\u00a0России, пока могут не\u00a0пройти.")}
        </div>
      )}

      {settings.methods.length > 1 && (
        <div>
          <div className={s.label} id="topup-method">
            {tt("Способ оплаты")}
          </div>
          <div className={s.methods} role="group" aria-labelledby="topup-method">
            {settings.methods.map((m) => (
              <button key={m.id} type="button" className={s.method} aria-pressed={method === m.id} onClick={() => setMethod(m.id)}>
                {m.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {settings.receipts.enabled && (
        <fieldset className={s.receipt} style={{ border: 0, margin: 0 }}>
          <legend className={s.label} style={{ padding: 0 }}>
            {tt("Чек")}
          </legend>
          <div className={s.radios}>
            {!settings.receipts.required && (
              <label className={s.radio}>
                <input type="radio" name="receipt" checked={receipt === "none"} onChange={() => setReceipt("none")} />
                {tt("Без\u00a0чека на\u00a0почту")}
              </label>
            )}
            <label className={s.radio}>
              <input type="radio" name="receipt" checked={receipt === "email"} onChange={() => setReceipt("email")} />
              {tt("На\u00a0email")}
            </label>
            <label className={s.radio}>
              <input type="radio" name="receipt" checked={receipt === "phone"} onChange={() => setReceipt("phone")} />
              {tt("По\u00a0SMS")}
            </label>
          </div>
          {receipt !== "none" && (
            <Input
              type={receipt === "email" ? "email" : "tel"}
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder={receipt === "email" ? "mail@example.ru" : "+7 900 000-00-00"}
              aria-label={receipt === "email" ? tt("Email для\u00a0чека") : tt("Телефон для\u00a0чека")}
              autoComplete="off"
            />
          )}
          <div className={s.hint}>
            <Lock size={12} aria-hidden />{" "}{tt("Контакт уходит только в\u00a0ЮKassa для\u00a0отправки чека и\u00a0у\u00a0нас не\u00a0сохраняется. Можно указать любой ящик, не\u00a0связанный с\u00a0вами.")}
          </div>
        </fieldset>
      )}

      {error && (
        <div className={s.error} role="alert">
          <AlertCircle size={16} aria-hidden /> <span>{error}</span>
        </div>
      )}

      <Button variant="primary" size="lg" block loading={busy} disabled={!valid} onClick={submit}>
        {valid ? tt(`Пополнить на\u00a0{rubK}`, { rubK: rubK(Math.round(value * 100)) }) : tt("Пополнить")}
      </Button>
      <div className={s.hint}>
        {tt("Платёжный сервис видит только сумму. Имя, карта и\u00a0псевдоним к\u00a0балансу не\u00a0привязываются.")}
      </div>
      <ConsentNote kind="payment" action={tt("Пополнить")} />
    </div>
  );
}
