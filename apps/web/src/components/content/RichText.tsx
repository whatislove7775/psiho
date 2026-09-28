import Link from "next/link";
import type { ReactNode } from "react";
import { typo } from "@/lib/typography";
import { Cite } from "./Markdown";
import s from "./content.module.css";

/**
 * Article body: sanitized HTML from the visual editor (server allowlist: apps/content/richtext.py)
 * → React nodes. No dangerouslySetInnerHTML: a tiny parser builds elements from the same allowlist
 * again, so anything unexpected is dropped here too. Works on the server (public pages) and in the
 * editor preview. Text nodes get the typo() non-breaking-space pass and [n] → citation superscripts.
 */
export function RichText({ html, className }: { html: string; className?: string }) {
  return <div className={className ? `${s.prose} ${className}` : s.prose}>{render(parseHtml(html), "r", true)}</div>;
}

type El = { tag: string; attrs: Record<string, string>; children: HNode[] };
type HNode = El | string;

const VOID = new Set(["br", "hr", "img"]);
const RENAME: Record<string, string> = {
  p: "p", h1: "h2", h2: "h2", h3: "h3", h4: "h3", h5: "h3", h6: "h3", ul: "ul", ol: "ol", li: "li",
  blockquote: "blockquote", aside: "aside", strong: "strong", b: "strong", em: "em", i: "em", code: "code",
  a: "a", figure: "figure", figcaption: "figcaption", br: "br", hr: "hr", img: "img",
};
const TOKEN = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s+[a-zA-Z_:][-a-zA-Z0-9_:.]*(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*\/?>|([^<]+)|</g;
const ATTR = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", mdash: "—", ndash: "–", laquo: "«", raquo: "»", hellip: "…" };

export function decodeEntities(t: string): string {
  return t.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

export function parseHtml(src: string): HNode[] {
  const root: El = { tag: "#root", attrs: {}, children: [] };
  const stack: El[] = [root];
  TOKEN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN.exec(src ?? ""))) {
    const top = stack[stack.length - 1];
    if (m[4] !== undefined) {
      top.children.push(decodeEntities(m[4]));
      continue;
    }
    if (!m[2]) {
      if (m[0] === "<") top.children.push("<");
      continue; // comment
    }
    const tag = m[2].toLowerCase();
    if (m[1]) {
      const i = stack.map((e) => e.tag).lastIndexOf(tag);
      if (i > 0) stack.length = i;
      continue;
    }
    const attrs: Record<string, string> = {};
    ATTR.lastIndex = 0;
    let a: RegExpExecArray | null;
    while ((a = ATTR.exec(m[3] ?? ""))) attrs[a[1].toLowerCase()] = decodeEntities(a[2] ?? a[3] ?? a[4] ?? "");
    const el: El = { tag, attrs, children: [] };
    top.children.push(el);
    if (!VOID.has(tag) && !m[0].endsWith("/>")) stack.push(el);
  }
  return root.children;
}

function safeHref(href: string): string | null {
  if (href.startsWith("/") && !href.startsWith("//")) return href;
  if (/^#[\w-]{1,60}$/.test(href)) return href;
  if (/^https?:\/\//i.test(href)) return href;
  if (/^(mailto:[^\s@]+@[^\s@]+|tel:[+\d\s()-]{3,20})$/i.test(href)) return href;
  return null;
}

const IMG_SRC = /^(?:https?:\/\/[a-z0-9.:-]+)?(\/media\/content\/[0-9a-f]{32})(?:-md)?\.webp$/i;
const CITE = /(\s?\[\d{1,2}(?:,\s*\d{1,2})*\])/g;

function text(t: string, key: string): ReactNode {
  const parts = typo(t).split(CITE);
  if (parts.length === 1) return parts[0];
  return parts.map((p, i) => {
    const c = /^\s?\[(\d{1,2}(?:,\s*\d{1,2})*)\]$/.exec(p);
    return c ? <Cite key={`${key}.${i}`} refs={c[1].split(",").map((n) => parseInt(n, 10))} /> : p;
  });
}

function plain(nodes: HNode[]): string {
  return nodes.map((n) => (typeof n === "string" ? n : plain(n.children))).join("");
}

/** Containers of blocks: whitespace between tags there is formatting, not text (invalid DOM in <ul>). */
const BLOCKS = new Set(["ul", "ol", "blockquote", "aside", "figure"]);

function render(nodes: HNode[], key: string, blocks = false): ReactNode[] {
  return nodes.map((n, i) => (blocks && typeof n === "string" && !n.trim() ? null : renderNode(n, `${key}.${i}`)));
}

function renderNode(n: HNode, key: string): ReactNode {
  if (typeof n === "string") return text(n, key);
  const tag = RENAME[n.tag];
  if (!tag) return n.tag === "script" || n.tag === "style" ? null : render(n.children, key);
  const kids = () => render(n.children, key, BLOCKS.has(tag));
  switch (tag) {
    case "br":
      return <br key={key} />;
    case "hr":
      return <hr key={key} />;
    case "img": {
      const m = IMG_SRC.exec(n.attrs.src ?? "");
      if (!m) return null;
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={key}
          src={`${m[1]}.webp`}
          srcSet={`${m[1]}-md.webp 800w, ${m[1]}.webp 1600w`}
          sizes="(max-width: 860px) 100vw, 860px"
          alt={n.attrs.alt ?? ""}
          loading="lazy"
          decoding="async"
        />
      );
    }
    case "figure": {
      const hasImg = n.children.some((c) => typeof c !== "string" && c.tag === "img" && IMG_SRC.test(c.attrs.src ?? ""));
      if (!hasImg) return null;
      return (
        <figure key={key} className={s.figure} data-width={n.attrs["data-width"] === "wide" ? "wide" : "column"}>
          {kids()}
        </figure>
      );
    }
    case "figcaption":
      return plain(n.children).trim() ? <figcaption key={key}>{kids()}</figcaption> : null;
    case "aside":
      return (
        <aside key={key} className={s.callout}>
          {kids()}
        </aside>
      );
    case "strong": {
      const t = plain(n.children).trim();
      // bare emergency numbers like 112 become tap-to-call links
      if (/^\d{3}$/.test(t)) return <a key={key} href={`tel:${t}`}><strong>{t}</strong></a>;
      return <strong key={key}>{kids()}</strong>;
    }
    case "a": {
      const href = safeHref(n.attrs.href ?? "");
      if (!href) return kids();
      if (href.startsWith("/")) return <Link key={key} href={href}>{kids()}</Link>;
      const ext = href.startsWith("http");
      return (
        <a key={key} href={href} target={ext ? "_blank" : undefined} rel={ext ? "noopener noreferrer" : undefined}>
          {kids()}
        </a>
      );
    }
    default: {
      const Tag = tag as "p";
      return <Tag key={key}>{kids()}</Tag>;
    }
  }
}

/** Plain text of an article body (word counts, JSON-LD, llms-full.txt). */
export function htmlToText(html: string): string {
  return decodeEntities(
    (html ?? "")
      .replace(/<(br|\/p|\/h[1-6]|\/li|\/blockquote|\/aside|\/figcaption)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

export function countWords(html: string): number {
  const t = htmlToText(html);
  return t ? t.split(/\s+/).length : 0;
}
