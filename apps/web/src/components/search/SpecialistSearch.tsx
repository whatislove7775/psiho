"use client";

/**
 * «Найти специалиста» → command-palette search.
 *
 * <SpecialistSearchProvider> (client cabinet layout) owns the overlay and the ⌘K / Ctrl+K hotkey.
 * <SearchTrigger> is a Button that morphs into the palette (FLIP with the Web Animations API:
 * the panel starts at the trigger's box and grows into place, the trigger's colour fades out,
 * then the content fades in; closing plays it backwards). With prefers-reduced-motion it is a
 * plain short fade. On phones the palette is a full-screen sheet.
 */
import { RatingPill } from "@/components/reviews/ReviewBits";
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { ArrowRight, CalendarClock, CornerDownLeft, Search, SearchX, X } from "lucide-react";
import { Badge, Button } from "@/ui";
import { SpecialistPhoto } from "@/components/avatar/SpecialistPhoto";
import { durationLabel } from "@/lib/api/availability";
import type { PsychologistPublic } from "@/lib/api/types";
import {
  activeFilters,
  queryToSearchParams,
  searchApi,
  type SearchFacets,
  type SearchResult,
  type SpecialistQuery,
} from "@/lib/api/search";
import { plural, rub, time, dayLabel } from "@/lib/format";
import { topicTone } from "@/lib/topicTone";
import { FilterBar } from "./FilterBar";
import s from "./search.module.css";

// ── Context & hotkey ──────────────────────────────────────────────────────────

interface SearchCtx {
  open: (origin?: HTMLElement | null, initial?: SpecialistQuery) => void;
  isOpen: boolean;
}
const Ctx = createContext<SearchCtx | null>(null);
export const useSpecialistSearch = () => useContext(Ctx);

const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

function visibleTrigger(): HTMLElement | null {
  const all = Array.from(document.querySelectorAll<HTMLElement>("[data-search-trigger]"));
  return (
    all.find((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
    }) ?? null
  );
}

export function SpecialistSearchProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ origin: HTMLElement | null; initial?: SpecialistQuery; key: number } | null>(null);
  const pathname = usePathname();

  const open = useCallback((origin?: HTMLElement | null, initial?: SpecialistQuery) => {
    setState((cur) => cur ?? { origin: origin ?? null, initial, key: Date.now() });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
      if (e.key.toLowerCase() !== "k" && e.key.toLowerCase() !== "л" && e.code !== "KeyK") return;
      e.preventDefault();
      setState((cur) => cur ?? { origin: visibleTrigger(), key: Date.now() });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // /app/specialists?… is where «Показать всех» leads: no palette on top of it after navigation
  const lastPath = useRef(pathname);
  useEffect(() => {
    if (lastPath.current !== pathname) setState(null);
    lastPath.current = pathname;
  }, [pathname]);

  const value = useMemo(() => ({ open, isOpen: !!state }), [open, state]);
  return (
    <Ctx.Provider value={value}>
      {children}
      {state && <SearchPalette key={state.key} origin={state.origin} initial={state.initial} onClosed={() => setState(null)} />}
    </Ctx.Provider>
  );
}

// ── Trigger ───────────────────────────────────────────────────────────────────

type TriggerProps = Omit<ComponentProps<typeof Button>, "href" | "onClick"> & {
  /** filters to start with (e.g. a topic) */
  initial?: SpecialistQuery;
  /** where to go when there is no palette on the page */
  fallbackHref?: string;
  /** show the ⌘K hint inside the button (desktop only) */
  hotkeyHint?: boolean;
};

/** Any «Найти специалиста» button. Opens the palette in the client cabinet, otherwise links to the catalogue. */
export const SearchTrigger = forwardRef<HTMLButtonElement, TriggerProps>(function SearchTrigger(
  { initial, fallbackHref = "/app/specialists", hotkeyHint, children, ...rest },
  fwd,
) {
  const ctx = useSpecialistSearch();
  const ref = useRef<HTMLButtonElement | null>(null);
  const [mac, setMac] = useState(true);
  useEffect(() => setMac(isMac()), []);
  if (!ctx) {
    return (
      <Button {...rest} href={fallbackHref}>
        {children}
      </Button>
    );
  }
  return (
    <Button
      {...rest}
      ref={(el) => {
        ref.current = el;
        if (typeof fwd === "function") fwd(el);
        else if (fwd) fwd.current = el;
      }}
      data-search-trigger=""
      aria-haspopup="dialog"
      aria-keyshortcuts="Meta+K Control+K"
      onClick={() => ctx.open(ref.current, initial)}
    >
      {children}
      {hotkeyHint && (
        <kbd className={s.triggerKbd} aria-hidden>
          {mac ? "⌘K" : "Ctrl K"}
        </kbd>
      )}
    </Button>
  );
});

// ── Palette ───────────────────────────────────────────────────────────────────

let facetsCache: Promise<SearchFacets> | null = null;
function loadFacets() {
  if (!facetsCache) {
    facetsCache = searchApi.facets().catch((e) => {
      facetsCache = null;
      throw e;
    });
  }
  return facetsCache;
}

const EASE = "cubic-bezier(.2,.85,.25,1)";
const OPEN_MS = 480;
const CLOSE_MS = 340;

function reducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

function usable(el: HTMLElement | null): el is HTMLElement {
  if (!el || !el.isConnected) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
}

/** Keyframes that take the panel from the trigger's box to its own (FLIP). */
function morphFrames(origin: HTMLElement, panel: HTMLElement) {
  const o = origin.getBoundingClientRect();
  const p = panel.getBoundingClientRect();
  const sx = o.width / p.width;
  const sy = o.height / p.height;
  const rO = Math.min(parseFloat(getComputedStyle(origin).borderTopLeftRadius) || 0, o.height / 2);
  const rP = parseFloat(getComputedStyle(panel).borderTopLeftRadius) || 0;
  return {
    from: {
      transform: `translate(${o.left - p.left}px, ${o.top - p.top}px) scale(${sx}, ${sy})`,
      borderRadius: `${rO / sx}px / ${rO / sy}px`,
    },
    to: { transform: "none", borderRadius: `${rP}px` },
    ghost: getComputedStyle(origin).backgroundImage !== "none" ? getComputedStyle(origin).backgroundImage : getComputedStyle(origin).backgroundColor,
  };
}

function SearchPalette({
  origin,
  initial,
  onClosed,
}: {
  origin: HTMLElement | null;
  initial?: SpecialistQuery;
  onClosed: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState<SpecialistQuery>(initial ?? {});
  const [text, setText] = useState(initial?.q ?? "");
  const [facets, setFacets] = useState<SearchFacets | null>(null);
  const [res, setRes] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [mac, setMac] = useState(true);
  const [mounted, setMounted] = useState(false);

  const root = useRef<HTMLDivElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const ghost = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const closing = useRef(false);
  const prevFocus = useRef<Element | null>(null);

  useEffect(() => {
    setMounted(true);
    setMac(isMac());
    prevFocus.current = document.activeElement;
  }, []);

  // facets («Часто ищут», filter values)
  useEffect(() => {
    let alive = true;
    loadFacets()
      .then((f) => alive && setFacets(f))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  // debounce the text into the query
  useEffect(() => {
    const t = setTimeout(() => setQuery((q) => (q.q === text ? q : { ...q, q: text })), 180);
    return () => clearTimeout(t);
  }, [text]);

  // live results
  useEffect(() => {
    const ctl = new AbortController();
    setLoading(true);
    searchApi
      .search(query, 6, ctl.signal)
      .then((r) => {
        setRes(r);
        setError(null);
        setActive(0);
      })
      .catch((e) => {
        if ((e as Error).name !== "AbortError") setError((e as Error).message);
      })
      .finally(() => !ctl.signal.aborted && setLoading(false));
    return () => ctl.abort();
  }, [query]);

  // ── open animation ──
  useEffect(() => {
    if (!mounted) return;
    const p = panel.current;
    const b = backdrop.current;
    const c = content.current;
    if (!p || !b || !c) return;
    const reduce = reducedMotion();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    input.current?.focus({ preventScroll: true });

    b.animate([{ opacity: 0 }, { opacity: 1 }], { duration: reduce ? 120 : 360, easing: "ease-out" });
    if (reduce || !usable(origin)) {
      p.animate(
        reduce
          ? [{ opacity: 0 }, { opacity: 1 }]
          : [
              { opacity: 0, transform: "translateY(-6px) scale(.985)" },
              { opacity: 1, transform: "none" },
            ],
        { duration: reduce ? 120 : 220, easing: EASE },
      );
    } else {
      const f = morphFrames(origin, p);
      if (ghost.current) ghost.current.style.background = f.ghost;
      p.animate([f.from, f.to], { duration: OPEN_MS, easing: EASE });
      ghost.current?.animate([{ opacity: 1 }, { opacity: 1, offset: 0.2 }, { opacity: 0 }], {
        duration: OPEN_MS,
        easing: "ease-out",
        fill: "forwards",
      });
      c.animate(
        [
          { opacity: 0, transform: "translateY(10px)" },
          { opacity: 0, transform: "translateY(10px)", offset: 0.35 },
          { opacity: 1, transform: "none" },
        ],
        { duration: OPEN_MS + 80, easing: EASE },
      );
      origin.style.visibility = "hidden";
    }
    return () => {
      document.body.style.overflow = overflow;
      if (origin) origin.style.visibility = "";
    };
  }, [mounted, origin]);

  // ── close (animated) ──
  const close = useCallback(
    (opts: { navigating?: boolean } = {}) => {
      if (closing.current) return;
      closing.current = true;
      const p = panel.current;
      const b = backdrop.current;
      const reduce = reducedMotion();
      const done = () => {
        if (origin) origin.style.visibility = "";
        if (!opts.navigating) {
          const back = usable(origin) ? origin : (prevFocus.current as HTMLElement | null);
          back?.focus?.({ preventScroll: true });
        }
        onClosed();
      };
      if (!p || !b) return done();
      const morphBack = !reduce && !opts.navigating && usable(origin);
      b.animate([{ opacity: 1 }, { opacity: 0 }], { duration: reduce ? 100 : CLOSE_MS, easing: "ease-in", fill: "forwards" });
      if (morphBack) {
        origin!.style.visibility = "hidden";
        const f = morphFrames(origin!, p);
        content.current?.animate([{ opacity: 1 }, { opacity: 0, offset: 0.4 }, { opacity: 0 }], { duration: CLOSE_MS, fill: "forwards" });
        if (ghost.current) {
          ghost.current.style.background = f.ghost;
          ghost.current.getAnimations().forEach((a) => a.cancel());
          ghost.current.animate([{ opacity: 0 }, { opacity: 0, offset: 0.3 }, { opacity: 1 }], { duration: CLOSE_MS, fill: "forwards" });
        }
        p.animate([f.to, f.from], { duration: CLOSE_MS, easing: "cubic-bezier(.4,0,.2,1)", fill: "forwards" }).finished.then(done, done);
      } else {
        p.animate([{ opacity: 1 }, { opacity: 0, transform: reduce ? "none" : "scale(.985)" }], {
          duration: reduce ? 100 : 160,
          easing: "ease-in",
          fill: "forwards",
        }).finished.then(done, done);
      }
    },
    [origin, onClosed],
  );

  const results = res?.results ?? [];
  const count = res?.count ?? 0;
  const nFilters = activeFilters(query);
  const hasQuery = !!text.trim() || nFilters > 0;
  const allHref = `/app/specialists${(() => {
    const qs = queryToSearchParams({ ...query, q: text }).toString();
    return qs ? `?${qs}` : "";
  })()}`;

  const openSpecialist = (p: PsychologistPublic) => {
    close({ navigating: true });
    router.push(`/app/specialists/${p.id}`);
  };
  const showAll = () => {
    close({ navigating: true });
    router.push(allHref);
  };

  const toggleTopic = (t: string) => {
    const cur = query.topics ?? [];
    const next = cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t];
    setQuery({ ...query, q: text, topics: next.length ? next : undefined });
  };
  const reset = () => {
    setText("");
    setQuery({});
    input.current?.focus();
  };

  // keyboard: arrows over results, Enter opens, ⌘/Ctrl+Enter shows all, Esc closes, Tab stays inside
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === "Tab") {
      if (!panel.current?.contains(document.activeElement)) {
        // focus was in a filter list (portalled popover): come back into the palette
        e.preventDefault();
        input.current?.focus();
        return;
      }
      const els = Array.from(
        panel.current?.querySelectorAll<HTMLElement>("input,button:not([disabled]),[href],[tabindex]:not([tabindex='-1'])") ?? [],
      ).filter((el) => el.offsetParent !== null);
      if (!els.length) return;
      const first = els[0];
      const last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
      return;
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      showAll();
      return;
    }
    if (e.target !== input.current) return;
    if (e.key === "ArrowDown" && results.length) {
      e.preventDefault();
      setActive((a) => (a + 1) % results.length);
    } else if (e.key === "ArrowUp" && results.length) {
      e.preventDefault();
      setActive((a) => (a - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (results[active]) openSpecialist(results[active]);
      else showAll();
    }
  };

  useEffect(() => {
    document.getElementById(`sp-opt-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!mounted) return null;

  const popular = facets?.popular ?? [];
  const selectedTopics = query.topics ?? [];
  const chips = [...selectedTopics.filter((t) => !popular.some((p) => p.label === t)).map((label) => ({ label, count: 0 })), ...popular];

  return createPortal(
    <div ref={root} className={s.root} onKeyDown={onKeyDown}>
      <div ref={backdrop} className={s.backdrop} onMouseDown={() => close()} aria-hidden />
      <div ref={panel} className={s.panel} role="dialog" aria-modal="true" aria-label="Поиск специалиста">
        <div ref={ghost} className={s.ghost} aria-hidden />
        <div ref={content} className={s.content}>
          <div className={s.inputRow}>
            <Search className={s.inputIcon} size={24} strokeWidth={1.9} aria-hidden />
            <input
              ref={input}
              className={s.input}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Что вас беспокоит? Тревога, отношения, имя"
              aria-label="Поиск специалиста"
              role="combobox"
              aria-expanded={results.length > 0}
              aria-controls="sp-results"
              aria-activedescendant={results[active] ? `sp-opt-${active}` : undefined}
              aria-autocomplete="list"
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="search"
            />
            {text && (
              <button type="button" className={s.clearText} onClick={() => { setText(""); input.current?.focus(); }}>
                Очистить
              </button>
            )}
            <button type="button" className={s.closeBtn} aria-label="Закрыть поиск" onClick={() => close()}>
              <X size={20} strokeWidth={2} />
            </button>
          </div>

          <div className={s.scroll}>
            {chips.length > 0 && (
              <section className={s.section} aria-labelledby="sp-popular">
                <h2 id="sp-popular" className={s.overline}>
                  Часто ищут
                </h2>
                <div className={s.chips}>
                  {chips.map((c) => {
                    const on = selectedTopics.includes(c.label);
                    return (
                      <button
                        key={c.label}
                        type="button"
                        className={s.chip}
                        data-tone={topicTone(c.label)}
                        aria-pressed={on}
                        onClick={() => toggleTopic(c.label)}
                      >
                        {c.label}
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            <FilterBar value={{ ...query, q: text }} onChange={(q) => setQuery(q)} facets={facets} className={s.paletteFilters} />

            <section className={s.section} aria-live="polite" aria-busy={loading}>
              <div className={s.resultsHead}>
                <h2 className={s.overline}>
                  {hasQuery
                    ? loading && !res
                      ? "Ищем"
                      : `Нашли ${count} ${plural(count, "специалиста", "специалиста", "специалистов")}`
                    : "Можно записаться в ближайшее время"}
                </h2>
                {nFilters > 0 && (
                  <button type="button" className={s.resetLink} onClick={reset}>
                    Сбросить всё
                  </button>
                )}
              </div>
              {error ? (
                <p className={s.empty}>{error}</p>
              ) : !loading && results.length === 0 ? (
                <div className={s.empty}>
                  <SearchX size={22} strokeWidth={1.8} aria-hidden />
                  <div>
                    <strong>Никого не нашли</strong>
                    <span>Попробуйте другое слово или уберите один из фильтров.</span>
                  </div>
                  <Button size="sm" variant="soft" onClick={reset}>
                    Сбросить
                  </Button>
                </div>
              ) : (
                <ul id="sp-results" role="listbox" aria-label="Специалисты" className={s.results} data-loading={loading ? "" : undefined}>
                  {(results.length ? results : SKELETON).map((p, i) =>
                    p ? (
                      <ResultRow
                        key={p.id}
                        p={p}
                        i={i}
                        active={i === active}
                        query={query}
                        onHover={() => setActive(i)}
                        onOpen={() => openSpecialist(p)}
                      />
                    ) : (
                      <li key={i} className={s.skeletonRow} aria-hidden>
                        <span className={s.skelCircle} />
                        <span className={s.skelLines}>
                          <span />
                          <span />
                        </span>
                      </li>
                    ),
                  )}
                </ul>
              )}
            </section>
          </div>

          <div className={s.footer}>
            <p className={s.helper}>
              <span className={s.keys} aria-hidden>
                <kbd>↑</kbd>
                <kbd>↓</kbd> выбрать
              </span>
              <span className={s.keys} aria-hidden>
                <kbd>
                  <CornerDownLeft size={12} strokeWidth={2.2} />
                </kbd>{" "}
                открыть
              </span>
              <span className={s.keys} aria-hidden>
                <kbd>Esc</kbd> закрыть
              </span>
              <span className={s.touchHelp}>Выберите запрос или опишите своими словами</span>
            </p>
            <Button
              size="sm"
              variant={hasQuery ? "primary" : "soft"}
              onClick={showAll}
              aria-keyshortcuts={mac ? "Meta+Enter" : "Control+Enter"}
            >
              {hasQuery ? "Показать всех" : "Все специалисты"}
              {hasQuery && count > 0 && <span className={s.count}>{count}</span>}
              <ArrowRight size={15} strokeWidth={2} aria-hidden />
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

const SKELETON: (null)[] = [null, null, null];

function slotLabel(iso: string) {
  return `${dayLabel(iso)} в ${time(iso)}`;
}

function ResultRow({
  p,
  i,
  active,
  query,
  onHover,
  onOpen,
}: {
  p: PsychologistPublic;
  i: number;
  active: boolean;
  query: SpecialistQuery;
  onHover: () => void;
  onOpen: () => void;
}) {
  const wanted = new Set((query.topics ?? []).map((t) => t.toLowerCase()));
  const q = (query.q ?? "").trim().toLowerCase();
  const topics = [...p.specializations].sort((a, b) => {
    const score = (x: string) => (wanted.has(x.toLowerCase()) || (q && x.toLowerCase().startsWith(q.slice(0, 4))) ? 0 : 1);
    return score(a) - score(b);
  });
  const d = query.duration ? p.booking?.durations.find((x) => x.minutes === query.duration) : undefined;
  const price = d?.price_rub ?? p.session_rate_rub;
  const minutes = d?.minutes ?? p.booking?.min_duration ?? 50;
  const soon = p.next_slot && Date.parse(p.next_slot) - Date.now() < 36 * 3600e3;
  return (
    <li
      id={`sp-opt-${i}`}
      role="option"
      aria-selected={active}
      className={s.row}
      data-active={active ? "" : undefined}
      onMouseMove={onHover}
      onClick={onOpen}
      style={{ ["--i" as string]: i }}
    >
      <SpecialistPhoto url={p.photo_url} name={p.display_name} size={48} alt="" />
      <div className={s.rowMain}>
        <div className={s.rowName}>
          {p.display_name}
          <span className={s.rowExp}>
            {p.experience_years} {plural(p.experience_years, "год", "года", "лет")} опыта
          </span>
          <RatingPill rating={p.rating} count={p.reviews_count} compact />
        </div>
        <div className={s.rowTopics}>
          {topics.slice(0, 3).map((t) => (
            <Badge key={t} tone={wanted.has(t.toLowerCase()) ? "primary" : topicTone(t)}>
              {t}
            </Badge>
          ))}
          {topics.length > 3 && <span className={s.more}>+{topics.length - 3}</span>}
        </div>
      </div>
      <div className={s.rowSide}>
        <span className={s.price}>
          {rub(price)}
          <span> за {durationLabel(minutes)}</span>
        </span>
        <span className={s.slot} data-soon={soon ? "" : undefined}>
          <CalendarClock size={14} strokeWidth={1.9} aria-hidden />
          {p.next_slot ? slotLabel(p.next_slot) : "Нет свободных окон"}
        </span>
      </div>
      <span className={s.enterHint} aria-hidden>
        <CornerDownLeft size={14} strokeWidth={2} />
      </span>
    </li>
  );
}
