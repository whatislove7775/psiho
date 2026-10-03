import { t as tt } from "@/lib/i18n";
/**
 * Contact detection (phones, @handles, messenger links, emails) — client-side mirror of
 * apps/api/apps/chat/contacts.py for instant feedback. The server is the source of truth;
 * test vectors: apps/api/apps/tests/data/contact_cases.json.
 */

export type ContactKind = "phone" | "handle" | "link" | "email";
export interface ContactHit {
  kind: ContactKind;
  start: number;
  end: number;
}

export const CONTACT_LABELS: Record<ContactKind, string> = {
  get phone() { return tt("номер телефона"); },
  get handle() { return tt("ник"); },
  get link() { return tt("ссылку на\u00a0мессенджер"); },
  get email() { return tt("почту"); },
};

const ALLOWED_NUMBERS = new Set(["88002000122", "88003334434", "84950510000"]);

const L = "a-zа-яё";
const DIGIT_WORDS: Record<string, string> = {
  ноль: "0", нуль: "0", один: "1", одна: "1", два: "2", две: "2", три: "3",
  четыре: "4", пять: "5", шесть: "6", семь: "7", восемь: "8", девять: "9",
};
const WORD = Object.keys(DIGIT_WORDS).sort((a, b) => b.length - a.length).join("|");
const UNIT = `(?:\\d|(?<![${L}])(?:${WORD})(?![${L}])|(?<=\\d)[oо]+(?![${L}]))`;
const SEP = "[\\s\\-‐‑–—.()\\[\\]/*_,]{0,3}";
const RUN = new RegExp(`(?:(?:\\+|(?<![${L}])плюс(?![${L}]))\\s*)?${UNIT}(?:${SEP}${UNIT})*`, "giu");
const UNIT_RE = new RegExp(UNIT, "giuy");

const EMAIL = new RegExp(
  `[\\p{L}\\p{N}_.+-]+@[\\p{L}\\p{N}_-]+(?:\\.[\\p{L}\\p{N}_-]+)*\\.[a-zа-я]{2,}` +
    `|[\\p{L}\\p{N}_.+-]{2,}\\s*(?:\\(at\\)|\\[at\\]|\\{at\\}|\\s(?:at|собака)\\s)\\s*[\\p{L}\\p{N}_-]+\\s*` +
    `(?:\\.|\\(dot\\)|\\[dot\\]|\\s(?:dot|точка)\\s)\\s*(?:ru|com|net|org|рф|me|io|su|by|kz|ua|info)(?![a-zа-я])`,
  "giu",
);
const HANDLE = new RegExp(`(?<![\\p{L}\\p{N}_@.])@[a-z][a-z0-9_.]{2,31}(?<!\\.)`, "giu");
const DOMAINS =
  "t\\s*\\.\\s*me|telegram\\.(?:me|org|dog)|wa\\.me|(?:api|chat|web)\\.whatsapp\\.com|whatsapp\\.com" +
  "|(?:m\\.)?vk\\.(?:com|me|cc)|vkontakte\\.ru|ok\\.ru|instagram\\.com|instagr\\.am|facebook\\.com|fb\\.(?:me|com)" +
  "|m\\.me|discord\\.(?:gg|com)|discordapp\\.com|(?:invite\\.)?viber\\.com|signal\\.(?:me|group)|snapchat\\.com" +
  "|tiktok\\.com|twitter\\.com|x\\.com|linkedin\\.com|skype\\.com|join\\.skype\\.com|icq\\.im|max\\.ru|threads\\.net";
const LINK = new RegExp(
  `(?<![\\p{L}\\p{N}_.])(?:https?://)?(?:www\\.)?(?:${DOMAINS})(?:\\s*/\\S*)?|(?:tg|viber|whatsapp|skype|discord)://\\S+`,
  "giu",
);
const MESSENGER =
  "telegram|телеграм\\p{L}*|телег[аеиу]|тг|tg|whats\\s?app|ват?с\\s?ап\\p{L}*|вотс?ап\\p{L}*|вацап\\p{L}*|viber|вайбер\\p{L}*" +
  "|discord|дискорд\\p{L}*|instagram|инстаграм\\p{L}*|инст[аеуы]|insta|vk|вк|вконтакте|signal|skype|скайп\\p{L}*" +
  "|facebook|фейсбук\\p{L}*|snapchat|max";
const INTENT =
  "пиши|напиши|напишите|пишите|написать|черкни|добавь|добавьте|добавляйся|добавляйтесь|стукни|стукните" +
  "|стучи|звони|позвони|позвоните|свяжемся|свяжитесь|связаться|связь|найди|найдите|ищи|ищите|мой|мою|моя" +
  "|мои|контакт\\p{L}*|ник|логин|аккаунт|переписываться|переписка|перейд\\p{L}*|перейти|давай|давайте|есть";
const B = `(?<![${L}\\d_])`;
const E = `(?![${L}\\d_])`;
const NW = "[^\\p{L}\\p{N}_\\n]";
const MENTION = new RegExp(
  `${B}(?:${INTENT})${E}(?:${NW}+[\\p{L}\\p{N}_-]+){0,3}?${NW}+(?:${MESSENGER})${E}` +
    `|${B}(?:${MESSENGER})\\s*[:=]\\s*\\S+` +
    `|${B}(?:${MESSENGER})\\s+[a-z][a-z0-9_.]{3,}`,
  "giu",
);

function toDigits(token: string): string {
  const t = token.toLowerCase();
  return DIGIT_WORDS[t] ?? t.replace(/[oо]/g, "0");
}

type Group = [string, number, number];

function groupsOf(text: string, start: number, end: number): Group[] {
  const groups: Group[] = [];
  let prevEnd = -1;
  let prevWord = true;
  let pos = start;
  const slice = text.slice(0, end);
  while (pos < end) {
    UNIT_RE.lastIndex = pos;
    const m = UNIT_RE.exec(slice);
    if (!m) {
      pos += 1;
      continue;
    }
    const tok = m[0];
    const word = tok.toLowerCase() in DIGIT_WORDS;
    if (groups.length && !word && !prevWord && prevEnd === m.index) {
      const g = groups[groups.length - 1];
      groups[groups.length - 1] = [g[0] + toDigits(tok), g[1], m.index + tok.length];
    } else {
      groups.push([toDigits(tok), m.index, m.index + tok.length]);
    }
    prevEnd = m.index + tok.length;
    prevWord = word;
    pos = prevEnd;
  }
  return groups;
}

function isPhone(digits: string, plusStart: boolean, seps: string, single: boolean): boolean {
  const n = digits.length;
  if (plusStart) return n >= 10 && n <= 15;
  if (n === 11) return "78".includes(digits[0]) && "3489".includes(digits[1]);
  if (n === 10) {
    if (digits[0] === "9") return true;
    return "348".includes(digits[0]) && (single || /[-()]/.test(seps));
  }
  return false;
}

function allowedEnd(groups: Group[], i: number): number | null {
  let digits = "";
  for (let j = i; j < groups.length; j++) {
    digits += groups[j][0];
    if (digits.length > 11) return null;
    if (ALLOWED_NUMBERS.has(digits) || (digits[0] === "7" && ALLOWED_NUMBERS.has("8" + digits.slice(1)))) return j;
  }
  return null;
}

function phoneHits(text: string): ContactHit[] {
  const hits: ContactHit[] = [];
  for (const run of text.matchAll(RUN)) {
    const rs = run.index ?? 0;
    const raw = run[0].toLowerCase();
    const plus = raw.startsWith("+") || raw.startsWith("плюс");
    const groups = groupsOf(text, rs, rs + run[0].length);
    let i = 0;
    while (i < groups.length) {
      const allowed = allowedEnd(groups, i);
      if (allowed !== null) {
        i = allowed + 1;
        continue;
      }
      let digits = "";
      let found: number | null = null;
      for (let j = i; j < groups.length; j++) {
        digits += groups[j][0];
        if (digits.length > 15) break;
        const seps = text.slice(groups[i][2], groups[j][1]);
        if (isPhone(digits, i === 0 && plus, seps, i === j)) {
          found = j;
          break;
        }
      }
      if (found !== null) {
        hits.push({ kind: "phone", start: i === 0 && plus ? rs : groups[i][1], end: groups[found][2] });
        i = found + 1;
      } else i += 1;
    }
  }
  return hits;
}

export function findContacts(text: string): ContactHit[] {
  if (!text) return [];
  const found: ContactHit[] = [];
  const add = (kind: ContactKind, rx: RegExp) => {
    for (const m of text.matchAll(rx)) found.push({ kind, start: m.index ?? 0, end: (m.index ?? 0) + m[0].length });
  };
  add("email", EMAIL);
  add("link", LINK);
  add("handle", HANDLE);
  add("link", MENTION);
  found.push(...phoneHits(text));
  found.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
  const out: ContactHit[] = [];
  for (const h of found) {
    if (out.length && h.start < out[out.length - 1].end) continue;
    out.push(h);
  }
  return out;
}

export function describeContacts(hits: ContactHit[]): string {
  return [...new Set(hits.map((h) => CONTACT_LABELS[h.kind]))].join(", ");
}
