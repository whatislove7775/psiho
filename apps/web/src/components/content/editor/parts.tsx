"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Clock } from "lucide-react";
import { MAX_TOPICS, TOPICS, topicLabel, type ArticleCard, type Source } from "@/lib/api/content";
import { ArticleBanner } from "@/components/content/ArticleBanner";
import { Sources } from "@/components/content/Evidence";
import { RichText } from "@/components/content/RichText";
import { typo } from "@/lib/typography";
import pub from "@/components/public/public.module.css";
import e from "./editor.module.css";

/** Up to three topics as chips; the order of picking is kept, the first one is primary. */
export function TopicPicker({ value, onChange, error }: { value: string[]; onChange: (v: string[]) => void; error?: ReactNode }) {
  const full = value.length >= MAX_TOPICS;
  return (
    <div className={e.topics} role="group" aria-label="Темы статьи">
      <div className={e.topicsHead}>
        Темы
        <span>до&nbsp;{MAX_TOPICS}, первая&nbsp;— основная</span>
      </div>
      <div className={e.chips}>
        {TOPICS.map((t) => {
          const i = value.indexOf(t.value);
          const on = i !== -1;
          return (
            <button
              key={t.value}
              type="button"
              className={e.chip}
              aria-pressed={on}
              disabled={!on && full}
              title={!on && full ? `Можно выбрать не больше ${MAX_TOPICS}` : undefined}
              onClick={() => onChange(on ? value.filter((v) => v !== t.value) : [...value, t.value])}
            >
              {on && <span className={e.chipN}>{i + 1}</span>}
              {t.label}
            </button>
          );
        })}
      </div>
      {error && <div className={e.fieldError}>{error}</div>}
    </div>
  );
}

/** Big title field that grows with the text (the page's only h1 when published). */
export function TitleField({ value, onChange, error, placeholder = "Заголовок" }: { value: string; onChange: (v: string) => void; error?: ReactNode; placeholder?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <>
      <textarea
        ref={ref}
        className={e.title}
        value={value}
        rows={1}
        maxLength={200}
        placeholder={placeholder}
        aria-label="Заголовок"
        onChange={(ev) => onChange(ev.target.value.replace(/\n/g, " "))}
        onKeyDown={(ev) => {
          // Enter → into the text
          if (ev.key === "Enter") {
            ev.preventDefault();
            (ev.currentTarget.closest("[data-writing]")?.querySelector(".ProseMirror") as HTMLElement | null)?.focus();
          }
        }}
      />
      {error && <div className={e.fieldError}>{error}</div>}
    </>
  );
}

/** What the published page will look like: same banner, meta, title, lead, body and sources. */
export function ArticlePreview({
  a,
  content,
  sources,
}: {
  a: Pick<ArticleCard, "title" | "summary" | "cover" | "cover_image" | "topic" | "reading_minutes"> & { topics?: string[] };
  content: string;
  sources?: Source[];
}) {
  const topics = a.topics?.length ? a.topics : [a.topic];
  return (
    <article className={`${pub.doc} ${e.preview}`}>
      <header className={pub.head}>
        <ArticleBanner a={a} className={pub.banner} />
        <div className={pub.meta}>
          {topics.map((t) => (
            <span key={t} style={{ color: "var(--c-primary-ink)" }}>
              {topicLabel(t)}
            </span>
          ))}
          <span>
            <Clock size={14} strokeWidth={1.8} aria-hidden />
            {a.reading_minutes} мин чтения
          </span>
        </div>
        <h1 className={pub.title}>{typo(a.title || "Заголовок статьи")}</h1>
        {a.summary && <p className={pub.lead}>{typo(a.summary)}</p>}
      </header>
      <RichText html={content} />
      {sources && sources.length > 0 && <Sources sources={sources} />}
    </article>
  );
}

type Draft = { title: string; content: string; at: number };

/**
 * Per-device safety net: the text is copied to localStorage as you type, so a closed tab or a lost
 * connection doesn't lose it. Returns a newer local copy (if any) to offer for restore.
 */
export function useLocalDraft(key: string, title: string, content: string, savedAt: string | null) {
  const [restore, setRestore] = useState<Draft | null>(null);
  const skip = useRef(true);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const d = JSON.parse(raw) as Draft;
      const saved = savedAt ? new Date(savedAt).getTime() : 0;
      if (d.at > saved + 2000 && (d.title !== title || d.content !== content) && (d.title || d.content)) setRestore(d);
      else localStorage.removeItem(key);
    } catch {
      /* storage unavailable */
    }
    // only on open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => {
    if (skip.current) {
      skip.current = false;
      return;
    }
    const t = window.setTimeout(() => {
      try {
        localStorage.setItem(key, JSON.stringify({ title, content, at: Date.now() }));
      } catch {
        /* ignore */
      }
    }, 600);
    return () => window.clearTimeout(t);
  }, [key, title, content]);
  const clear = () => {
    setRestore(null);
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  };
  return { restore, dismiss: clear, clear };
}

export function wordsLabel(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  const w = m10 === 1 && m100 !== 11 ? "слово" : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? "слова" : "слов";
  return `${n} ${w}`;
}
