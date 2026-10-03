/**
 * Tiny gettext-style i18n. Russian is the source language and the key:
 *
 *   t("Записаться")                         → "Book" in English, unchanged in Russian
 *   t("Осталось {n} мин", { n: 5 })        → "5 min left"
 *   tj("Пишет {name}", { name: <b>…</b> })  → ReactNode (placeholders may be elements)
 *   plural(n, "год", "года", "лет")          → lib/format.ts, English forms live in the dictionary as "year|years"
 *
 * Missing translations fall back to Russian, so a new string never breaks a page;
 * `node scripts/i18n-check.mjs` lists the keys the English dictionary is missing.
 * Non-breaking spaces in keys don't matter (keys are compared with ordinary spaces).
 */
import { Fragment, createElement, type ReactNode } from "react";
import { DEFAULT_LOCALE, LOCALE_META, localePath, type Locale } from "./config";
import { getLocale } from "./locale";
import en from "./dict/en";

export * from "./config";
export { getLocale } from "./locale";

type Dict = Record<string, string>;
const DICTS: Partial<Record<Locale, Dict>> = { en };

const NBSP_RE = / /g;
const normalized = new WeakMap<Dict, Map<string, string>>();

function table(dict: Dict): Map<string, string> {
  let map = normalized.get(dict);
  if (!map) {
    map = new Map(Object.entries(dict).map(([k, v]) => [k.replace(NBSP_RE, " "), v]));
    normalized.set(dict, map);
  }
  return map;
}

/** Translation of a source (Russian) string for `locale`, or undefined. */
export function lookup(source: string, locale: Locale = getLocale()): string | undefined {
  if (locale === DEFAULT_LOCALE) return source;
  const dict = DICTS[locale];
  return dict ? table(dict).get(source.replace(NBSP_RE, " ")) : undefined;
}

type Vars = Record<string, string | number | null | undefined>;

function fill(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k] ?? "") : m));
}

/** Translate a UI string. */
export function t(source: string, vars?: Vars): string {
  return fill(lookup(source) ?? source, vars);
}

/**
 * Translate with a context when one Russian word means different things in English:
 * tc("круг", "Выйти") looks up "круг::Выйти" ("Leave") before plain "Выйти" ("Log out").
 */
export function tc(context: string, source: string, vars?: Vars): string {
  const withContext = lookup(`${context}::${source}`);
  return withContext !== undefined && getLocale() !== DEFAULT_LOCALE ? fill(withContext, vars) : t(source, vars);
}

/** Translate a string whose placeholders are React nodes (merged JSX text). */
export function tj(source: string, vars: Record<string, ReactNode>): ReactNode {
  const template = lookup(source) ?? source;
  const parts: ReactNode[] = [];
  let last = 0;
  let i = 0;
  template.replace(/\{(\w+)\}/g, (m, k: string, offset: number) => {
    if (offset > last) parts.push(template.slice(last, offset));
    const v = k in vars ? vars[k] : m;
    parts.push(typeof v === "object" && v !== null ? createElement(Fragment, { key: i++ }, v) : v);
    last = offset + m.length;
    return m;
  });
  if (last < template.length) parts.push(template.slice(last));
  return parts.length === 1 ? parts[0] : parts;
}

/** Marks a module-level string for extraction; translate it at render time with t(value). */
export function msg<S extends string>(source: S): S {
  return source;
}

/**
 * A module-level list of source strings whose items are translated when read
 * (WEEKDAYS[i], WEEKDAYS.map(…), join…) — module code runs once, reads happen per request.
 */
export function translatedList<T extends readonly string[]>(list: T): T {
  return new Proxy(list, {
    get(target, prop, receiver) {
      const v = Reflect.get(target, prop, receiver);
      return typeof prop === "string" && typeof v === "string" && /^\d+$/.test(prop) ? t(v) : v;
    },
  });
}

/** Plural category for the current locale (Intl.PluralRules), used by lib/format.ts plural(). */
export function pluralForm(n: number, forms: string[], locale: Locale = getLocale()): string {
  const rule = new Intl.PluralRules(LOCALE_META[locale].intl).select(n);
  if (locale === "ru") {
    const idx = rule === "one" ? 0 : rule === "few" ? 1 : 2;
    return forms[Math.min(idx, forms.length - 1)];
  }
  const idx = rule === "one" ? 0 : 1;
  return forms[Math.min(idx, forms.length - 1)];
}

/** A public link in the current language: lp("/articles") → "/en/articles" on English pages (server or client). */
export function lp(path: string): string {
  const [p, rest = ""] = path.split(/(?=[?#])/);
  return localePath(p || "/", getLocale()) + rest;
}

/** BCP 47 tag for Intl/toLocale*String in the current locale ("ru-RU", "en-US"). */
export function intlLocale(locale: Locale = getLocale()): string {
  return LOCALE_META[locale].intl;
}
