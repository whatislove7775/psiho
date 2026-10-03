/**
 * Languages of materials (articles, practices) — mirrors CONTENT_LANGUAGES in apps/content/models.py.
 * Interface languages are LOCALES (./config.ts); content can be in more languages (specialists write in theirs).
 */
import { getLocale, msg, t } from "./index";

export const CONTENT_LANGUAGES: { code: string; native: string }[] = [
  { code: "ru", native: "Русский" },
  { code: "en", native: "English" },
  { code: "uk", native: "Українська" },
  { code: "be", native: "Беларуская" },
  { code: "kk", native: "Қазақша" },
  { code: "uz", native: "Oʻzbekcha" },
  { code: "ky", native: "Кыргызча" },
  { code: "hy", native: "Հայերեն" },
  { code: "ka", native: "ქართული" },
  { code: "az", native: "Azərbaycanca" },
  { code: "ro", native: "Română" },
  { code: "de", native: "Deutsch" },
  { code: "es", native: "Español" },
  { code: "fr", native: "Français" },
];

const IN_RUSSIAN = msg("на русском");
const IN_ENGLISH = msg("на английском");

/** Label for a material that isn't in the page language: «на русском» / «in Russian» / «Українська». */
export function otherLanguageLabel(code: string | null | undefined): string | null {
  const lang = code || "ru";
  if (lang === getLocale()) return null;
  if (lang === "ru") return t(IN_RUSSIAN);
  if (lang === "en") return t(IN_ENGLISH);
  return CONTENT_LANGUAGES.find((l) => l.code === lang)?.native ?? lang.toUpperCase();
}
