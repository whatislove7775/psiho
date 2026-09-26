/**
 * «Незаметный режим» и «Защита от скриншотов» — личные настройки приватности.
 *
 * Источник правды — localStorage этого браузера (ключ PRIVACY_KEY), чтобы режим
 * включался мгновенно, ещё до загрузки React. По желанию настройки копируются
 * в аккаунт (/api/v1/me/settings/), чтобы «переехать» на другие устройства.
 *
 * Сам режим применяет встроенный в <head> скрипт STEALTH_SCRIPT: он работает до
 * гидрации и на любой странице — нейтральный заголовок вкладки и значок, подмена
 * манифеста PWA и быстрый выход по двойному Esc (window.__aprosopPanic).
 */

export const PRIVACY_KEY = "aprosop.privacy";
export const PRIVACY_EVENT = "aprosop:privacy";

export type StealthPreset = "notes" | "weather" | "calendar" | "docs";
export type ExitTarget = "weather" | "news" | "search" | "wiki";

export interface StealthPrefs {
  enabled: boolean;
  preset: StealthPreset;
  exit: ExitTarget;
  /** при быстром выходе ещё и выйти из аккаунта и стереть данные сайта в этом браузере */
  wipe: boolean;
}

export interface PrivacyPrefs {
  stealth: StealthPrefs;
  /** «Защита от скриншотов» во всех моих переписках (на этом устройстве) */
  screen_protect: boolean;
  /** копировать настройки в аккаунт */
  sync: boolean;
  /** когда изменено (мс) — чья версия новее, устройства или аккаунта */
  v: number;
}

export const DEFAULT_PREFS: PrivacyPrefs = {
  stealth: { enabled: false, preset: "notes", exit: "weather", wipe: false },
  screen_protect: false,
  sync: true,
  v: 0,
};

const svg = (body: string) =>
  "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${body}</svg>`);

export const STEALTH_PRESETS: Record<StealthPreset, { title: string; icon: string }> = {
  notes: {
    title: "Заметки",
    icon: svg(
      '<rect x="5" y="3" width="22" height="26" rx="5" fill="#F5C542"/><path d="M10 11h12M10 16h12M10 21h8" stroke="#7A5B00" stroke-width="2.2" stroke-linecap="round"/>',
    ),
  },
  weather: {
    title: "Погода",
    icon: svg(
      '<circle cx="12" cy="12" r="7" fill="#FFB224"/><path d="M11 27a6 6 0 0 1-.6-12 7.5 7.5 0 0 1 14.2 2.2A5 5 0 0 1 24 27z" fill="#8DB8F2"/>',
    ),
  },
  calendar: {
    title: "Календарь",
    icon: svg(
      '<rect x="4" y="5" width="24" height="23" rx="5" fill="#fff" stroke="#D0D4DC" stroke-width="1.5"/><path d="M4 10a5 5 0 0 1 5-5h14a5 5 0 0 1 5 5v2H4z" fill="#E5484D"/><g fill="#6B7280"><rect x="8" y="15" width="4" height="4" rx="1"/><rect x="14" y="15" width="4" height="4" rx="1"/><rect x="20" y="15" width="4" height="4" rx="1"/><rect x="8" y="21" width="4" height="4" rx="1"/><rect x="14" y="21" width="4" height="4" rx="1"/></g>',
    ),
  },
  docs: {
    title: "Документы",
    icon: svg(
      '<path d="M8 3h11l7 7v17a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" fill="#3B82F6"/><path d="M19 3v5a2 2 0 0 0 2 2h5z" fill="#93C5FD"/><path d="M10 16h12M10 20h12M10 24h7" stroke="#fff" stroke-width="2" stroke-linecap="round"/>',
    ),
  },
};

export const EXIT_TARGETS: Record<ExitTarget, { label: string; short?: string; url: string }> = {
  weather: { label: "Погода", url: "https://yandex.ru/pogoda" },
  news: { label: "Новости", url: "https://dzen.ru/news" },
  search: { label: "Поиск", url: "https://ya.ru" },
  wiki: { label: "Википедия", short: "Вики", url: "https://ru.wikipedia.org" },
};

/**
 * Inline <head> script (runs before first paint and before React).
 * Exposes window.__aprosopStealth() (re-apply after a settings change) and
 * window.__aprosopPanic() (quick exit), and listens for double Esc.
 */
export const STEALTH_SCRIPT = `(function(){try{
var K=${JSON.stringify(PRIVACY_KEY)},P=${JSON.stringify(
  Object.fromEntries(Object.entries(STEALTH_PRESETS).map(([k, v]) => [k, [v.title, v.icon]])),
)},X=${JSON.stringify(Object.fromEntries(Object.entries(EXIT_TARGETS).map(([k, v]) => [k, v.url])))};
var d=document,w=window,on=null,origTitle=null,mo=null,lastEsc=0;
function prefs(){try{return JSON.parse(localStorage.getItem(K)||"null")||{}}catch(e){return {}}}
function st(){var s=prefs().stealth||{};return s}
function fix(){if(!on)return;var t=on[0];if(d.title!==t){origTitle=d.title;d.title=t}
var ls=d.querySelectorAll('link[rel~="icon"],link[rel="shortcut icon"]'),has=false;
for(var i=0;i<ls.length;i++){var l=ls[i];if(l.getAttribute("data-stealth")){has=true;continue}
if(!l.hasAttribute("data-orig"))l.setAttribute("data-orig",l.getAttribute("href")||"");
if(l.getAttribute("href")!==on[1]){l.setAttribute("href",on[1]);l.removeAttribute("sizes");l.setAttribute("type","image/svg+xml")}}
if(!has&&d.head){var n=d.createElement("link");n.rel="icon";n.type="image/svg+xml";n.href=on[1];n.setAttribute("data-stealth","1");d.head.appendChild(n)}
var m=d.querySelector('link[rel="manifest"]');if(m){if(!m.hasAttribute("data-orig"))m.setAttribute("data-orig",m.getAttribute("href")||"");var mh="/stealth/manifest-"+on[2]+".json";if(m.getAttribute("href")!==mh)m.setAttribute("href",mh)}}
function restore(){var ls=d.querySelectorAll("link[data-orig]");for(var i=0;i<ls.length;i++){ls[i].setAttribute("href",ls[i].getAttribute("data-orig"));ls[i].removeAttribute("data-orig")}
var s=d.querySelectorAll("link[data-stealth]");for(var j=0;j<s.length;j++)s[j].remove();if(origTitle)d.title=origTitle;origTitle=null}
function apply(){var s=st(),p=s.enabled&&P[s.preset||"notes"];
if(p){on=[p[0],p[1],s.preset||"notes"];d.documentElement.setAttribute("data-stealth","");fix();
if(!mo){mo=new MutationObserver(fix);mo.observe(d.head||d.documentElement,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:["href"]})}}
else{if(mo){mo.disconnect();mo=null}if(on){on=null;restore()}d.documentElement.removeAttribute("data-stealth")}}
function panic(){var s=st();try{d.documentElement.style.visibility="hidden";d.title=""}catch(e){}
if(s.wipe){try{var keep=localStorage.getItem(K);localStorage.clear();if(keep)localStorage.setItem(K,keep)}catch(e){}
try{sessionStorage.clear()}catch(e){}try{w.caches&&caches.keys().then(function(k){k.forEach(function(x){caches.delete(x)})})}catch(e){}}
w.location.replace(X[s.exit]||X.weather)}
w.__aprosopStealth=apply;w.__aprosopPanic=panic;
w.addEventListener("keydown",function(e){if(e.key!=="Escape"||e.repeat||!st().enabled)return;var t=Date.now();if(t-lastEsc<600){lastEsc=0;panic()}else lastEsc=t},true);
w.addEventListener("storage",function(e){if(e.key===K)apply()});
w.addEventListener("pageshow",function(e){if(e.persisted&&d.documentElement.style.visibility==="hidden"){w.location.reload()}});
apply();if(d.readyState==="loading")d.addEventListener("DOMContentLoaded",function(){if(on)fix()});
}catch(e){}})();`;

type StealthWindow = Window & { __aprosopStealth?: () => void; __aprosopPanic?: () => void };

export function readPrefs(): PrivacyPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = JSON.parse(localStorage.getItem(PRIVACY_KEY) || "null") as Partial<PrivacyPrefs> | null;
    if (!raw) return DEFAULT_PREFS;
    return {
      ...DEFAULT_PREFS,
      ...raw,
      stealth: { ...DEFAULT_PREFS.stealth, ...(raw.stealth ?? {}) },
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

/** Save locally and apply at once (title, favicon, hotkey). Returns the stored value. */
export function writePrefs(next: PrivacyPrefs, opts: { touch?: boolean } = {}): PrivacyPrefs {
  const value = opts.touch === false ? next : { ...next, v: Date.now() };
  try {
    localStorage.setItem(PRIVACY_KEY, JSON.stringify(value));
  } catch {
    /* private mode: the setting lives until the tab closes */
  }
  (window as StealthWindow).__aprosopStealth?.();
  window.dispatchEvent(new CustomEvent(PRIVACY_EVENT, { detail: value }));
  return value;
}

/** Quick exit: hide the page, optionally wipe local data, replace with a neutral site. */
export function panicExit() {
  const w = window as StealthWindow;
  if (w.__aprosopPanic) w.__aprosopPanic();
  else window.location.replace(EXIT_TARGETS[readPrefs().stealth.exit]?.url ?? EXIT_TARGETS.weather.url);
}
