/**
 * Countries the visitor can pick in settings («Страна»). The country drives crisis lines, the currency hint
 * and which legal documents apply. It never leaves the browser except as a `country` cookie / request field
 * (Тиша uses it to point to local help). Default: guessed from the browser time zone, then from the language.
 *
 * Crisis lines: only well-known national services, each checked against the service's own site (Sept 2026):
 *   US/CA 988 — 988lifeline.org, 988.ca · UK/IE Samaritans 116 123 — samaritans.org
 *   UA Lifeline Ukraine 7333 — lifelineukraine.com · DE TelefonSeelsorge 0800 111 0 111 — telefonseelsorge.de
 *   RU 8-800-333-44-34 (adults), 8-800-2000-122 (children/teens) · KZ 111 «Amanat» contact centre
 *   BY 133 emergency psychological help · emergency numbers: 112 (EU, UZ, GE, MD, AM, AZ, KZ, RU, UA, BY),
 *   911 (US, CA, AM), 999 (UK), 103/102 (KG).
 * Everywhere else: the emergency number + findahelpline.com (ThroughLine's vetted directory, 130+ countries).
 * Before adding a line, verify it on the operator's official site and note it above.
 */
import { msg, t } from "./index";
import type { Locale } from "./config";

export type CountryCode =
  | "RU" | "BY" | "KZ" | "UZ" | "KG" | "AM" | "AZ" | "GE" | "MD" | "UA"
  | "US" | "CA" | "GB" | "IE" | "DE" | "EU" | "XX";

export interface CrisisLine {
  /** Source (Russian) label, translated with t() */
  label: string;
  phone: string;
  /** Dialable form for tel: */
  tel: string;
  note?: string;
}

export interface Country {
  code: CountryCode;
  name: string;
  emergency: string;
  lines: CrisisLine[];
  /** Directory page for this country */
  helplines: string;
}

const FAH = "https://findahelpline.com";
const line = (label: string, phone: string, note?: string): CrisisLine => ({ label, phone, tel: phone.replace(/[^\d+]/g, ""), note });

export const COUNTRIES: Country[] = [
  { code: "RU", name: msg("Россия"), emergency: "112", helplines: `${FAH}/countries/ru`, lines: [
    line(msg("Телефон доверия"), "8-800-333-44-34", msg("бесплатно, круглосуточно")),
    line(msg("Детский телефон доверия"), "8-800-2000-122", msg("для подростков и родителей")),
  ] },
  { code: "BY", name: msg("Беларусь"), emergency: "112", helplines: `${FAH}/countries/by`, lines: [
    line(msg("Экстренная психологическая помощь"), "133", msg("бесплатно, круглосуточно")),
  ] },
  { code: "KZ", name: msg("Казахстан"), emergency: "112", helplines: `${FAH}/countries/kz`, lines: [
    line(msg("Контакт-центр «111»"), "111", msg("в том числе психологическая помощь, круглосуточно")),
  ] },
  { code: "UZ", name: msg("Узбекистан"), emergency: "112", helplines: `${FAH}/countries/uz`, lines: [] },
  { code: "KG", name: msg("Кыргызстан"), emergency: "103", helplines: `${FAH}/countries/kg`, lines: [] },
  { code: "AM", name: msg("Армения"), emergency: "911", helplines: `${FAH}/countries/am`, lines: [] },
  { code: "AZ", name: msg("Азербайджан"), emergency: "112", helplines: `${FAH}/countries/az`, lines: [] },
  { code: "GE", name: msg("Грузия"), emergency: "112", helplines: `${FAH}/countries/ge`, lines: [] },
  { code: "MD", name: msg("Молдова"), emergency: "112", helplines: `${FAH}/countries/md`, lines: [] },
  { code: "UA", name: msg("Украина"), emergency: "112", helplines: `${FAH}/countries/ua`, lines: [
    line("Lifeline Ukraine", "7333", msg("бесплатно, круглосуточно")),
  ] },
  { code: "US", name: msg("США"), emergency: "911", helplines: `${FAH}/countries/us`, lines: [
    line("988 Lifeline", "988", msg("звонок или SMS, круглосуточно")),
  ] },
  { code: "CA", name: msg("Канада"), emergency: "911", helplines: `${FAH}/countries/ca`, lines: [
    line("9-8-8", "988", msg("звонок или SMS, круглосуточно")),
  ] },
  { code: "GB", name: msg("Великобритания"), emergency: "999", helplines: `${FAH}/countries/gb`, lines: [
    line("Samaritans", "116 123", msg("бесплатно, круглосуточно")),
  ] },
  { code: "IE", name: msg("Ирландия"), emergency: "112", helplines: `${FAH}/countries/ie`, lines: [
    line("Samaritans", "116 123", msg("бесплатно, круглосуточно")),
  ] },
  { code: "DE", name: msg("Германия"), emergency: "112", helplines: `${FAH}/countries/de`, lines: [
    line("TelefonSeelsorge", "0800 111 0 111", msg("бесплатно, круглосуточно")),
  ] },
  { code: "EU", name: msg("Другая страна Европы"), emergency: "112", helplines: FAH, lines: [] },
  { code: "XX", name: msg("Другая страна"), emergency: "112", helplines: FAH, lines: [] },
];

export const COUNTRY_KEY = "aprosop.country";
export const COUNTRY_COOKIE = "country";

export function countryBy(code: string | null | undefined): Country | undefined {
  return COUNTRIES.find((c) => c.code === code);
}

export function countryName(c: Country): string {
  return t(c.name);
}

const RU_TZ = /^(Europe\/(Moscow|Kaliningrad|Samara|Volgograd|Saratov|Ulyanovsk|Astrakhan|Kirov)|Asia\/(Yekaterinburg|Omsk|Novosibirsk|Barnaul|Tomsk|Novokuznetsk|Krasnoyarsk|Irkutsk|Chita|Yakutsk|Khandyga|Vladivostok|Ust-Nera|Magadan|Sakhalin|Srednekolymsk|Kamchatka|Anadyr))$/;
const TZ: [RegExp, CountryCode][] = [
  [RU_TZ, "RU"],
  [/^Europe\/Minsk$/, "BY"],
  [/^Asia\/(Almaty|Qyzylorda|Aqtobe|Aqtau|Atyrau|Oral|Qostanay)$/, "KZ"],
  [/^Asia\/(Tashkent|Samarkand)$/, "UZ"],
  [/^Asia\/Bishkek$/, "KG"],
  [/^Asia\/Yerevan$/, "AM"],
  [/^Asia\/Baku$/, "AZ"],
  [/^Asia\/Tbilisi$/, "GE"],
  [/^Europe\/Chisinau$/, "MD"],
  [/^Europe\/(Kiev|Kyiv|Uzhgorod|Zaporozhye)$/, "UA"],
  [/^Europe\/London$/, "GB"],
  [/^Europe\/Dublin$/, "IE"],
  [/^Europe\/(Berlin|Busingen)$/, "DE"],
  [/^America\/(Toronto|Vancouver|Edmonton|Winnipeg|Halifax|St_Johns|Regina|Moncton|Whitehorse|Yellowknife|Iqaluit|Glace_Bay|Goose_Bay|Swift_Current|Dawson_Creek|Fort_Nelson|Cambridge_Bay|Rankin_Inlet|Resolute|Atikokan|Creston|Dawson|Inuvik)$/, "CA"],
  [/^(America\/(New_York|Chicago|Denver|Los_Angeles|Phoenix|Anchorage|Detroit|Boise|Juneau|Sitka|Nome|Adak|Menominee|Metlakatla|Yakutat|Indiana\/.+|Kentucky\/.+|North_Dakota\/.+)|Pacific\/Honolulu)$/, "US"],
  [/^Europe\//, "EU"],
];

/** Best guess for a first visit: the browser's time zone, then the language. */
export function guessCountry(locale: Locale): CountryCode {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    for (const [re, code] of TZ) if (re.test(tz)) return code;
  } catch {
    /* no Intl time zone */
  }
  return locale === "ru" ? "RU" : "XX";
}

/**
 * Where health data is a GDPR / UK GDPR «special category» (Art. 9): signup asks for explicit consent.
 * The server records it (apps.intl.Consent). Keep in sync with EXPLICIT_HEALTH_CONSENT in apps/intl/services.py.
 */
export function needsExplicitHealthConsent(code: CountryCode): boolean {
  return code === "EU" || code === "GB" || code === "IE" || code === "DE";
}
