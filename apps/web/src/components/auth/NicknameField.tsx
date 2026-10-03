"use client";

import { t as tt } from "@/lib/i18n";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Check, PencilLine, RefreshCw, Shuffle } from "lucide-react";
import { nicknameApi, aliasHint } from "@/lib/api/nickname";
import ui from "@/ui/ui.module.css";
import s from "./nickname.module.css";

export interface NicknameState {
  alias: string;
  /** true when the alias can be submitted (generated, or custom + checked free). */
  ok: boolean;
  custom: boolean;
}

/**
 * Nickname picker: a generated alias with «Придумать другое» (regenerate) and «Ввести своё» (custom,
 * live-checked on the server). Used at signup (/start) and in the profile.
 */
export function NicknameField({
  initial,
  onChange,
  startCustom = false,
  label = tt("Ваш ник"),
}: {
  /** Current alias (profile). Without it a fresh suggestion is fetched. */
  initial?: string;
  onChange: (st: NicknameState) => void;
  startCustom?: boolean;
  label?: string;
}) {
  const id = useId();
  const [custom, setCustom] = useState(startCustom);
  const [generated, setGenerated] = useState(initial ?? "");
  const [text, setText] = useState(startCustom ? initial ?? "" : "");
  const [spinning, setSpinning] = useState(false);
  const [status, setStatus] = useState<{ kind: "idle" | "checking" | "ok" | "error"; msg?: string }>({ kind: "idle" });
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const inputRef = useRef<HTMLInputElement>(null);

  const regenerate = useCallback(async () => {
    setSpinning(true);
    try {
      const { alias } = await nicknameApi.suggest();
      setGenerated(alias);
    } catch {
      /* keep the previous one; the server generates one at signup anyway */
    } finally {
      setSpinning(false);
    }
  }, []);

  useEffect(() => {
    if (!initial) void regenerate();
  }, [initial, regenerate]);

  // Report generated mode
  useEffect(() => {
    if (!custom) onChangeRef.current({ alias: generated, ok: initial ? !!generated && generated !== initial : true, custom: false });
  }, [custom, generated, initial]);

  // Live check in custom mode
  useEffect(() => {
    if (!custom) return;
    const local = text.trim() ? aliasHint(text) : null;
    if (!text.trim()) {
      setStatus({ kind: "idle" });
      onChangeRef.current({ alias: "", ok: false, custom: true });
      return;
    }
    if (local) {
      setStatus({ kind: "error", msg: local });
      onChangeRef.current({ alias: text, ok: false, custom: true });
      return;
    }
    setStatus({ kind: "checking" });
    onChangeRef.current({ alias: text, ok: false, custom: true });
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await nicknameApi.check(text, ctl.signal);
        const same = initial && r.alias === initial;
        setStatus(r.available ? { kind: "ok", msg: same ? tt("Это\u00a0ваш текущий ник") : tt("Свободен · не\u00a0используйте настоящее имя") } : { kind: "error", msg: r.error ?? tt("Недоступен") });
        onChangeRef.current({ alias: r.alias, ok: r.available && !same, custom: true });
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setStatus({ kind: "error", msg: (e as Error).message });
      }
    }, 400);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [custom, text, initial]);

  const toGenerated = () => {
    setCustom(false);
    if (initial && generated === initial) void regenerate();
  };

  const toCustom = () => {
    setCustom(true);
    setText((t) => t || "");
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  return (
    <div className={s.field}>
      <div className={s.head}>
        <label className={s.label} htmlFor={custom ? id : undefined}>
          {label}
        </label>
        <button type="button" className={s.switch} onClick={custom ? toGenerated : toCustom}>
          {custom ? <Shuffle size={14} strokeWidth={2} aria-hidden /> : <PencilLine size={14} strokeWidth={2} aria-hidden />}
          {custom ? tt("Сгенерировать") : tt("Ввести своё")}
        </button>
      </div>

      {custom ? (
        <>
          <input
            ref={inputRef}
            id={id}
            className={[ui.input, status.kind === "error" ? ui.inputInvalid : ""].join(" ")}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={32}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder={tt("например, тихая-сова")}
            aria-invalid={status.kind === "error" || undefined}
            aria-describedby={`${id}-st`}
          />
          <p id={`${id}-st`} className={s.status} data-kind={status.kind} aria-live="polite">
            {status.kind === "ok" ? (
              <>
                <Check size={14} strokeWidth={2.4} aria-hidden /> {status.msg}
              </>
            ) : status.kind === "error" ? (
              status.msg
            ) : status.kind === "checking" ? (
              tt("Проверяем…")
            ) : (
              tt("Не\u00a0используйте настоящее имя. 3–32\u00a0символа: буквы, цифры, пробел, - и\u00a0_")
            )}
          </p>
        </>
      ) : (
        <div className={s.generated}>
          <span className={s.alias} aria-live="polite">
            {generated || "…"}
          </span>
          <button
            type="button"
            className={s.regen}
            onClick={regenerate}
            disabled={spinning}
            data-spin={spinning || undefined}
            aria-label={tt("Придумать другое")}
            title={tt("Придумать другое")}
          >
            <RefreshCw size={16} strokeWidth={2} aria-hidden />
            <span className={s.regenText}>{tt("Придумать другое")}</span>
          </button>
        </div>
      )}
    </div>
  );
}
