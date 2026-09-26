import Link from "next/link";
import type { ReactNode } from "react";
import s from "./content.module.css";

/**
 * Small, safe Markdown renderer for articles (no HTML passthrough, builds React nodes).
 * Supports: # ## ### headings, paragraphs, - / * / 1. lists, > quotes, ---,
 * **bold**, *italic*, `code`, [links](https://… or /path), citations [1] / [1, 2] → links to #source-N.
 */
export function Markdown({ source, className }: { source: string; className?: string }) {
  return <div className={className ? `${s.prose} ${className}` : s.prose}>{renderBlocks(source)}</div>;
}

/** Superscript citation links: [1, 3] → ¹ ³ pointing to the sources list (#source-1). */
export function Cite({ refs }: { refs: number[] }) {
  if (!refs.length) return null;
  return (
    <sup className={s.cite}>
      {refs.map((n, i) => (
        <a key={n} href={`#source-${n}`} aria-label={`Источник ${n}`}>
          {i > 0 ? ", " : ""}
          {n}
        </a>
      ))}
    </sup>
  );
}

type Block =
  | { t: "h"; level: 2 | 3 | 4; text: string }
  | { t: "p"; text: string }
  | { t: "ul" | "ol"; items: string[] }
  | { t: "quote"; text: string }
  | { t: "hr" };

export function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const out: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push({ t: "p", text: para.join(" ") });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) {
      flush();
      continue;
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(trimmed);
    if (h) {
      flush();
      // "#" in an article body becomes h2: the page title is the only h1
      out.push({ t: "h", level: (h[1].length + 1) as 2 | 3 | 4, text: h[2] });
      continue;
    }
    if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
      flush();
      out.push({ t: "hr" });
      continue;
    }
    if (trimmed.startsWith(">")) {
      flush();
      const q: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        q.push(lines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      i--;
      out.push({ t: "quote", text: q.join(" ") });
      continue;
    }
    const ul = /^[-*•]\s+/.test(trimmed);
    const ol = /^\d+[.)]\s+/.test(trimmed);
    if (ul || ol) {
      flush();
      const re = ul ? /^[-*•]\s+/ : /^\d+[.)]\s+/;
      const items: string[] = [];
      while (i < lines.length) {
        const l = lines[i].trim();
        if (re.test(l)) items.push(l.replace(re, ""));
        else if (l && !/^([-*•]|\d+[.)])\s+/.test(l) && items.length && /^\s{2,}/.test(lines[i]))
          items[items.length - 1] += " " + l; // indented continuation
        else break;
        i++;
      }
      i--;
      out.push({ t: ul ? "ul" : "ol", items });
      continue;
    }
    para.push(trimmed);
  }
  flush();
  return out;
}

function renderBlocks(src: string): ReactNode[] {
  return parseBlocks(src).map((b, i) => {
    switch (b.t) {
      case "h": {
        const Tag = `h${b.level}` as "h2" | "h3" | "h4";
        return <Tag key={i}>{inline(b.text)}</Tag>;
      }
      case "p":
        return <p key={i}>{inline(b.text)}</p>;
      case "ul":
        return (
          <ul key={i}>
            {b.items.map((it, j) => (
              <li key={j}>{inline(it)}</li>
            ))}
          </ul>
        );
      case "ol":
        return (
          <ol key={i}>
            {b.items.map((it, j) => (
              <li key={j}>{inline(it)}</li>
            ))}
          </ol>
        );
      case "quote":
        return <blockquote key={i}>{inline(b.text)}</blockquote>;
      case "hr":
        return <hr key={i} />;
    }
  });
}

const INLINE = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|_[^_\s][^_]*_|`[^`]+`|\[[^\]]+\]\([^)\s]+\)|\s?\[\d{1,2}(?:,\s*\d{1,2})*\](?!\())/g;

function safeHref(href: string): string | null {
  if (href.startsWith("/") && !href.startsWith("//")) return href;
  if (/^https?:\/\//i.test(href)) return href;
  if (/^tel:[+\d\s()-]+$/i.test(href)) return href;
  return null;
}

export function inline(text: string): ReactNode[] {
  const parts = text.split(INLINE);
  return parts.map((part, i) => {
    if (!part) return null;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      const inner = part.slice(2, -2);
      // bare numbers like **112** become tap-to-call links
      if (/^\d{3}$/.test(inner)) return <a key={i} href={`tel:${inner}`}><strong>{inner}</strong></a>;
      return <strong key={i}>{inner}</strong>;
    }
    if ((part.startsWith("*") && part.endsWith("*")) || (part.startsWith("_") && part.endsWith("_")))
      return <em key={i}>{part.slice(1, -1)}</em>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={i}>{part.slice(1, -1)}</code>;
    const cite = /^\s?\[(\d{1,2}(?:,\s*\d{1,2})*)\]$/.exec(part);
    if (cite) return <Cite key={i} refs={cite[1].split(",").map((n) => parseInt(n, 10))} />;
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
    if (link) {
      const href = safeHref(link[2]);
      if (!href) return link[1];
      if (href.startsWith("/")) return <Link key={i} href={href}>{link[1]}</Link>;
      return (
        <a key={i} href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer">
          {link[1]}
        </a>
      );
    }
    return part;
  });
}
