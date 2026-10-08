"use client";

import { t as tt } from "@/lib/i18n";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  Eye,
  Glasses,
  Palette,
  Paintbrush,
  Redo2,
  RotateCcw,
  Scissors,
  Shuffle,
  Smile,
  Undo2,
  UserRound,
} from "lucide-react";
import { Button } from "@/ui";
import {
  AvatarView,
  type AvatarViewHandle,
} from "@/components/avatar/AvatarView";
import {
  DEFAULT_AVATAR,
  avatarKey,
  baseDefault,
  normalizeAvatar,
  randomAvatar,
  type AvatarConfig,
} from "@/lib/avatar/schema";
import { CATEGORIES, withBase, type SetField } from "./categories";
import { headzBase } from "@/lib/avatar/headz/catalog";
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
  {
    mouthSmileLeft: 0.8,
    mouthSmileRight: 0.8,
    cheekSquintLeft: 0.3,
    cheekSquintRight: 0.3,
  },
  { jawOpen: 0.6, browInnerUp: 0.4 },
  { browInnerUp: 0.9, eyeWideLeft: 0.6, eyeWideRight: 0.6 },
  { eyeBlinkLeft: 1, mouthSmileLeft: 0.5, mouthSmileRight: 0.2 },
  { mouthPucker: 0.7, browDownLeft: 0.3, browDownRight: 0.3 },
  {},
];

const CATEGORY_ICONS = [
  UserRound,
  Palette,
  Eye,
  UserRound,
  Scissors,
  UserRound,
  Paintbrush,
  Glasses,
];

const CAPTION = {
  get client() {
    return tt("Таким вас увидит специалист на\u00a0созвоне");
  },
  get pro() {
    return tt(
      "Таким вас увидят клиенты в\u00a0каталоге и\u00a0на\u00a0созвонах",
    );
  },
};

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const isMac = () =>
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

export function AvatarStudio({
  initial,
  seed,
  onSave,
  saving = false,
  variant = "client",
}: AvatarStudioProps) {
  const start = useMemo(
    () => (initial ? normalizeAvatar(initial) : DEFAULT_AVATAR),
    [],
  ); // eslint-disable-line react-hooks/exhaustive-deps
  const hist = useHistory<AvatarConfig>(start);
  const cfg = hist.value;
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;

  // What is stored on the server (null = never saved)
  const [savedKey, setSavedKey] = useState<string | null>(() =>
    initial ? avatarKey(start) : null,
  );
  const key = avatarKey(cfg);
  const hasChanges = key !== (savedKey ?? avatarKey(start));
  const canSave = !saving && (hasChanges || savedKey === null);

  const set: SetField = useCallback(
    (k, v, coalesce) => {
      const cur = cfgRef.current;
      const next =
        k === "base" ? withBase(cur, v as string) : { ...cur, [k]: v };
      cfgRef.current = next;
      hist.set(next, coalesce);
    },
    [hist.set], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const shuffle = () => hist.set(randomAvatar(Date.now(), true));
  // back to the character as authored (keeps the chosen character)
  const reset = () => hist.set(baseDefault(cfgRef.current.base));

  // ── Keyboard: undo / redo ──
  const { undo, redo } = hist;
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.isContentEditable ||
          t.tagName === "TEXTAREA" ||
          (t.tagName === "INPUT" &&
            /text|search|email|password/.test((t as HTMLInputElement).type)))
      )
        return;
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
      if (
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey
      )
        return;
      const a = (e.target as HTMLElement | null)?.closest?.(
        "a[href]",
      ) as HTMLAnchorElement | null;
      if (!a || a.target === "_blank") return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname === location.pathname)
        return;
      if (
        !window.confirm(
          tt("Аватар не\u00a0сохранён. Уйти и\u00a0потерять изменения?"),
        )
      ) {
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
  useEffect(() => {
    panelRef.current?.scrollTo({ top: 0 });
  }, [active]);
  const baseId = useId();
  const tileCfg = useDebounced(cfg, 260);

  const selectTab = (id: string, focus = false) => {
    setActive(id);
    const el = tabRefs.current[id];
    if (focus) el?.focus();
  };
  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = CATEGORIES.findIndex((c) => c.id === active);
    let n = -1;
    if (e.key === "ArrowRight") n = (i + 1) % CATEGORIES.length;
    else if (e.key === "ArrowLeft")
      n = (i - 1 + CATEGORIES.length) % CATEGORIES.length;
    else if (e.key === "ArrowDown") n = (i + 4) % CATEGORIES.length;
    else if (e.key === "ArrowUp")
      n = (i - 4 + CATEGORIES.length) % CATEGORIES.length;
    else if (e.key === "Home") n = 0;
    else if (e.key === "End") n = CATEGORIES.length - 1;
    if (n < 0) return;
    e.preventDefault();
    selectTab(CATEGORIES[n].id, true);
  };

  const cat = CATEGORIES.find((c) => c.id === active)!;
  const Panel = cat.Panel;
  const mod = isMac() ? "⌘" : "Ctrl";

  return (
    <div className={s.studio}>
      <div className={s.previewCol}>
        <div
          className={s.stage}
          style={{
            ["--glow" as string]: cfg.hairColor ?? headzBase(cfg.base).hair,
            ["--skin" as string]: cfg.skin ?? headzBase(cfg.base).skin,
          }}
        >
          <AvatarView
            ref={viewRef}
            config={cfg}
            framing="face"
            interactive
            className={s.view}
          />
          <p className={s.caption}>{CAPTION[variant]}</p>
        </div>
        <div
          className={s.tools}
          role="toolbar"
          aria-label={tt("Действия с\u00a0аватаром")}
        >
          <Button
            size="sm"
            variant="secondary"
            icon={<Shuffle size={16} />}
            onClick={shuffle}
          >
            {tt("Случайный")}
          </Button>
          <Button
            size="sm"
            variant={alive ? "soft" : "secondary"}
            icon={<Smile size={16} />}
            aria-pressed={alive}
            onClick={() => setAlive((v) => !v)}
          >
            {tt("Мимика")}
          </Button>
          <span className={s.toolsGap} />
          <Button
            size="sm"
            variant="ghost"
            iconOnly
            icon={<RotateCcw size={18} />}
            aria-label={tt("Сбросить")}
            title={tt("Сбросить к исходному")}
            onClick={reset}
          />
          <Button
            size="sm"
            variant="ghost"
            iconOnly
            icon={<Undo2 size={18} />}
            aria-label={tt("Отменить")}
            title={tt(`Отменить ({mod}+Z)`, { mod })}
            disabled={!hist.canUndo}
            onClick={hist.undo}
          />
          <Button
            size="sm"
            variant="ghost"
            iconOnly
            icon={<Redo2 size={18} />}
            aria-label={tt("Повторить")}
            title={tt(`Повторить ({mod}+Shift+Z)`, { mod })}
            disabled={!hist.canRedo}
            onClick={hist.redo}
          />
        </div>
      </div>

      <div className={s.editor}>
        <div className={s.tabsWrap}>
          <div
            className={s.tabs}
            role="tablist"
            aria-label={tt("Что\u00a0настроить")}
            onKeyDown={onTabKey}
          >
            {CATEGORIES.map((c, i) => {
              const Icon = CATEGORY_ICONS[i];
              return (
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
                  <Icon size={18} aria-hidden />
                  <span>{c.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div
          ref={panelRef}
          className={s.panel}
          role="tabpanel"
          id={`${baseId}-panel`}
          aria-labelledby={`${baseId}-tab-${active}`}
          tabIndex={-1}
        >
          <Panel key={active} cfg={cfg} tileCfg={tileCfg} set={set} />
        </div>

        <div className={s.saveBar} data-idle={!canSave || undefined}>
          <span
            className={s.status}
            data-state={hasChanges ? "dirty" : savedKey ? "saved" : "new"}
            aria-live="polite"
          >
            <span className={s.statusLong}>
              {hasChanges
                ? tt("Есть несохранённые изменения")
                : savedKey
                  ? tt("Все изменения сохранены")
                  : tt("Аватар ещё не\u00a0сохранён")}
            </span>
            <span className={s.statusShort} aria-hidden>
              {hasChanges
                ? tt("Не\u00a0сохранено")
                : savedKey
                  ? tt("Сохранено")
                  : tt("Не\u00a0сохранён")}
            </span>
          </span>
          <Button
            variant="primary"
            size="md"
            onClick={save}
            loading={saving}
            disabled={!canSave}
          >
            {tt("Сохранить аватар")}
          </Button>
        </div>
      </div>
    </div>
  );
}
