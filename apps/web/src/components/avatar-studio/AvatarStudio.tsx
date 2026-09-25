"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight, Redo2, Shuffle, Smile, Undo2 } from "lucide-react";
import { Button } from "@/ui";
import { AvatarView, type AvatarViewHandle } from "@/components/avatar/AvatarView";
import { avatarKey, normalizeAvatar, randomAvatar, type AvatarConfig } from "@/lib/avatar/schema";
import { CATEGORIES, withField, type SetField } from "./categories";
import { useHistory } from "./useHistory";
import s from "./AvatarStudio.module.css";

export interface AvatarStudioProps {
  /** Stored config, or null when the user has never saved one. */
  initial: AvatarConfig | null;
  /** Seed for the stable random face shown when `initial` is null. */
  seed: string | number;
  /** Persist. Resolve when saved; throw/reject to keep the changes marked unsaved. */
  onSave: (cfg: AvatarConfig) => Promise<void> | void;
  saving?: boolean;
  variant?: "client" | "pro";
}

/** Demo expressions for «Мимика» (ARKit blendshape weights). */
const EXPRESSIONS: Record<string, number>[] = [
  { mouthSmileLeft: 0.8, mouthSmileRight: 0.8, cheekSquintLeft: 0.3, cheekSquintRight: 0.3 },
  { jawOpen: 0.6, browInnerUp: 0.4 },
  { browInnerUp: 0.9, eyeWideLeft: 0.6, eyeWideRight: 0.6 },
  { eyeBlinkLeft: 1, mouthSmileLeft: 0.5, mouthSmileRight: 0.2 },
  { mouthPucker: 0.7, browDownLeft: 0.3, browDownRight: 0.3 },
  {},
];

const CAPTION = {
  client: "Таким вас увидит специалист на созвоне",
  pro: "Таким вас увидят клиенты в каталоге и на созвонах",
};

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

export function AvatarStudio({ initial, seed, onSave, saving = false, variant = "client" }: AvatarStudioProps) {
  const start = useMemo(() => (initial ? normalizeAvatar(initial) : randomAvatar(seed)), []); // eslint-disable-line react-hooks/exhaustive-deps
  const hist = useHistory<AvatarConfig>(start);
  const cfg = hist.value;
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;

  // What is stored on the server (null = never saved)
  const [savedKey, setSavedKey] = useState<string | null>(() => (initial ? avatarKey(start) : null));
  const key = avatarKey(cfg);
  const hasChanges = key !== (savedKey ?? avatarKey(start));
  const canSave = !saving && (hasChanges || savedKey === null);

  const set: SetField = useCallback(
    (g, k, v, coalesce) => {
      const next = withField(cfgRef.current, g, k, v);
      cfgRef.current = next;
      hist.set(next, coalesce);
    },
    [hist.set], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const shuffle = () => hist.set(randomAvatar(Date.now()));

  // ── Keyboard: undo / redo ──
  const { undo, redo } = hist;
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || t.tagName === "TEXTAREA" || (t.tagName === "INPUT" && /text|search|email|password/.test((t as HTMLInputElement).type)))) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((k === "z" && e.shiftKey) || k === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  // ── Leaving with unsaved changes ──
  useEffect(() => {
    if (!hasChanges) return;
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    // In-app links (client-side navigation doesn't fire beforeunload)
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank") return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname === location.pathname) return;
      if (!window.confirm("Аватар не сохранён. Уйти и потерять изменения?")) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", onUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [hasChanges]);

  // ── Live preview + «Мимика» ──
  const viewRef = useRef<AvatarViewHandle>(null);
  const [alive, setAlive] = useState(false);
  useEffect(() => {
    const r = () => viewRef.current?.renderer;
    if (!alive) {
      r()?.setExpression({});
      return;
    }
    let i = 0;
    r()?.setExpression(EXPRESSIONS[0]);
    const id = setInterval(() => {
      i = (i + 1) % EXPRESSIONS.length;
      r()?.setExpression(EXPRESSIONS[i]);
    }, 1300);
    return () => clearInterval(id);
  }, [alive]);

  // ── Save ──
  const save = async () => {
    const snapshot = cfgRef.current;
    try {
      await onSave(snapshot);
      setSavedKey(avatarKey(snapshot));
    } catch {
      /* the page reports the error; changes stay marked unsaved */
    }
  };

  // ── Categories (tablist) ──
  const [active, setActive] = useState(CATEGORIES[0].id);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const panelRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const tabsWrapRef = useRef<HTMLDivElement>(null);
  const firstTab = useRef(true);
  // Switching category while scrolled deep: bring the new panel's top under the sticky tabs
  useEffect(() => {
    if (firstTab.current) {
      firstTab.current = false;
      return;
    }
    const ed = editorRef.current?.getBoundingClientRect().top;
    const tabs = tabsWrapRef.current?.getBoundingClientRect().top;
    if (ed != null && tabs != null && ed < tabs - 1) window.scrollBy({ top: ed - tabs });
  }, [active]);
  const baseId = useId();
  const tileCfg = useDebounced(cfg, 260);

  const selectTab = (id: string, focus = false) => {
    setActive(id);
    const el = tabRefs.current[id];
    if (focus) el?.focus();
    el?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  };
  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = CATEGORIES.findIndex((c) => c.id === active);
    let n = -1;
    if (e.key === "ArrowRight") n = (i + 1) % CATEGORIES.length;
    else if (e.key === "ArrowLeft") n = (i - 1 + CATEGORIES.length) % CATEGORIES.length;
    else if (e.key === "Home") n = 0;
    else if (e.key === "End") n = CATEGORIES.length - 1;
    if (n < 0) return;
    e.preventDefault();
    selectTab(CATEGORIES[n].id, true);
  };

  // Overflowing tab strip: edge chevrons for mouse users, wheel scrolls sideways
  const stripRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    const update = () => setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || el.scrollWidth <= el.clientWidth) return;
      // At the strip's end let the page scroll as usual
      if (e.deltaY > 0 && el.scrollLeft + el.clientWidth >= el.scrollWidth - 1) return;
      if (e.deltaY < 0 && el.scrollLeft <= 0) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    el.addEventListener("wheel", onWheel, { passive: false });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      el.removeEventListener("wheel", onWheel);
      ro.disconnect();
    };
  }, []);
  const nudge = (dir: 1 | -1) => stripRef.current?.scrollBy({ left: dir * 220, behavior: "smooth" });

  const cat = CATEGORIES.find((c) => c.id === active)!;
  const Panel = cat.Panel;
  const mod = isMac() ? "⌘" : "Ctrl";

  return (
    <div className={s.studio}>
      <div className={s.previewCol}>
        <div className={s.stage} style={{ ["--glow" as string]: cfg.outfit.color, ["--skin" as string]: cfg.skin.tone }}>
          <AvatarView ref={viewRef} config={cfg} framing="portrait" interactive className={s.view} />
          <p className={s.caption}>{CAPTION[variant]}</p>
        </div>
        <div className={s.tools} role="toolbar" aria-label="Действия с аватаром">
          <Button size="sm" variant="secondary" icon={<Shuffle size={16} />} onClick={shuffle}>
            Перемешать
          </Button>
          <Button
            size="sm"
            variant={alive ? "soft" : "secondary"}
            icon={<Smile size={16} />}
            aria-pressed={alive}
            onClick={() => setAlive((v) => !v)}
          >
            Мимика
          </Button>
          <span className={s.toolsGap} />
          <Button size="sm" variant="ghost" iconOnly icon={<Undo2 size={18} />} aria-label="Отменить" title={`Отменить (${mod}+Z)`} disabled={!hist.canUndo} onClick={hist.undo} />
          <Button
            size="sm"
            variant="ghost"
            iconOnly
            icon={<Redo2 size={18} />}
            aria-label="Повторить"
            title={`Повторить (${mod}+Shift+Z)`}
            disabled={!hist.canRedo}
            onClick={hist.redo}
          />
        </div>
      </div>

      <div ref={editorRef} className={s.editor}>
        <div ref={tabsWrapRef} className={s.tabsWrap}>
          {edges.left && (
            <button type="button" tabIndex={-1} aria-hidden className={`${s.tabNudge} ${s.tabNudgeLeft}`} onClick={() => nudge(-1)}>
              <ChevronLeft size={18} />
            </button>
          )}
          <div ref={stripRef} className={s.tabs} role="tablist" aria-label="Что настроить" onKeyDown={onTabKey}>
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                ref={(el) => {
                  tabRefs.current[c.id] = el;
                }}
                type="button"
                role="tab"
                id={`${baseId}-tab-${c.id}`}
                aria-selected={c.id === active}
                aria-controls={`${baseId}-panel`}
                tabIndex={c.id === active ? 0 : -1}
                className={s.tab}
                onClick={() => selectTab(c.id)}
              >
                {c.label}
              </button>
            ))}
          </div>
          {edges.right && (
            <button type="button" tabIndex={-1} aria-hidden className={`${s.tabNudge} ${s.tabNudgeRight}`} onClick={() => nudge(1)}>
              <ChevronRight size={18} />
            </button>
          )}
        </div>

        <div ref={panelRef} className={s.panel} role="tabpanel" id={`${baseId}-panel`} aria-labelledby={`${baseId}-tab-${active}`} tabIndex={-1}>
          <Panel key={active} cfg={cfg} tileCfg={tileCfg} set={set} />
        </div>

        <div className={s.saveBar} data-idle={!canSave || undefined}>
          <span className={s.status} data-state={hasChanges ? "dirty" : savedKey ? "saved" : "new"} aria-live="polite">
            <span className={s.statusLong}>
              {hasChanges ? "Есть несохранённые изменения" : savedKey ? "Все изменения сохранены" : "Аватар ещё не сохранён"}
            </span>
            <span className={s.statusShort} aria-hidden>
              {hasChanges ? "Не сохранено" : savedKey ? "Сохранено" : "Не сохранён"}
            </span>
          </span>
          <Button variant="primary" size="md" onClick={save} loading={saving} disabled={!canSave}>
            Сохранить аватар
          </Button>
        </div>
      </div>
    </div>
  );
}
