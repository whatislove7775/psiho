import { NextResponse, type NextRequest } from "next/server";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  LOCALE_HEADER,
  isLocale,
  isPublicPath,
  localePath,
  pickFromAcceptLanguage,
  splitLocale,
  type Locale,
} from "@/lib/i18n/config";

/**
 * Language routing.
 * - /en/articles → rendered from /articles with x-locale: en (and the choice is remembered in a cookie).
 * - Unprefixed public pages are Russian; a visitor who chose another language is redirected to its prefix.
 * - Cabinets (/app, /pro, /room…) have no prefix: cookie → Accept-Language → ru.
 */
const YEAR = 60 * 60 * 24 * 365;
const BOT_RE = /bot|crawl|spider|slurp|yandex|google|bing|duckduck|baidu|facebookexternalhit|preview/i;

function remember(res: NextResponse, locale: Locale) {
  res.cookies.set(LOCALE_COOKIE, locale, { path: "/", maxAge: YEAR, sameSite: "lax" });
  return res;
}

function withLocale(req: NextRequest, locale: Locale, rewriteTo?: URL) {
  const headers = new Headers(req.headers);
  headers.set(LOCALE_HEADER, locale);
  return rewriteTo
    ? NextResponse.rewrite(rewriteTo, { request: { headers } })
    : NextResponse.next({ request: { headers } });
}

export function middleware(req: NextRequest) {
  const url = req.nextUrl;
  // Translated link-preview cards: /og-image/<section>?lang=en (see app/og-image)
  if (url.pathname.startsWith("/og-image/")) {
    const lang = url.searchParams.get("lang");
    return withLocale(req, isLocale(lang) ? lang : DEFAULT_LOCALE);
  }

  const { locale: prefixed, path } = splitLocale(url.pathname);
  const cookie = req.cookies.get(LOCALE_COOKIE)?.value;
  const chosen = isLocale(cookie) ? cookie : null;

  if (prefixed) {
    // /ru/… and /en/app/… → canonical URL, remembering the choice.
    if (prefixed === DEFAULT_LOCALE || !isPublicPath(path)) {
      const to = url.clone();
      to.pathname = path;
      return remember(NextResponse.redirect(to), prefixed);
    }
    const to = url.clone();
    to.pathname = path;
    const res = withLocale(req, prefixed, to);
    return chosen === prefixed ? res : remember(res, prefixed);
  }

  if (isPublicPath(path)) {
    let want: Locale = chosen ?? DEFAULT_LOCALE;
    // First visit of the home page: follow the browser language (never for crawlers — they index each URL as is).
    if (!chosen && path === "/" && !BOT_RE.test(req.headers.get("user-agent") || "")) {
      want = pickFromAcceptLanguage(req.headers.get("accept-language"));
    }
    if (want !== DEFAULT_LOCALE) {
      const to = url.clone();
      to.pathname = localePath(path, want);
      return NextResponse.redirect(to);
    }
    return withLocale(req, DEFAULT_LOCALE);
  }

  return withLocale(req, chosen ?? pickFromAcceptLanguage(req.headers.get("accept-language")));
}

export const config = {
  // Everything except Next internals, the API/media proxies, websocket and files with an extension.
  matcher: ["/((?!_next/|api/|media/|ws/|.*\\.[a-zA-Z0-9]+$).*)"],
};
