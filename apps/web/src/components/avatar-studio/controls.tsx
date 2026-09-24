"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Ban, Pipette } from "lucide-react";
import { Skeleton } from "@/ui";
import type { AvatarConfig } from "@/lib/avatar/schema";
import type { Framing } from "@/lib/avatar/kit/types";
import { cachedThumb, requestThumb, thumbKey } from "./thumbQueue";
import { curveGradient, findBase, locateOnCurve, sameColor, shadeAt, type CurveMode } from "./color";
import s from "./AvatarStudio.module.css";

const cx = (...c: unknown[]) => c.filter((x) => typeof x === "string" && x).join(" ");

// ── Section ───────────────────────────────────────────────────────────────────

export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  const id = useId();
  return (
    <section className={s.section} aria-labelledby={id}>
      <div className={s.sectionHead}>
        <h3 id={id} className={s.sectionTitle}>
          {title}
        </h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

// ── Colour: swatches + shade slider + custom ─────────────────────────────────

/**
 * Apple-style colour picker: a row of swatches (the picked one is ringed), a
 * gradient slider that walks lighter/darker shades of that swatch, and a
 * «Свой цвет» escape hatch. `value === null` means "none" (when allowNone).
 */
export function ColorControl({
  label,
  palette,
  value,
  onChange,
  allowNone,
  noneLabel = "Нет",
  mode = "default",
  sliderLabel,
}: {
  label: string;
  palette: readonly string[];
  value: string | null;
  onChange: (v: string | null, key?: string) => void;
  allowNone?: boolean;
  noneLabel?: string;
  mode?: CurveMode;
  sliderLabel?: string;
}) {
  // The swatch the slider is anchored to. Stays put while the slider moves;
  // re-derived when the value jumps elsewhere (undo, shuffle, custom colour).
  const [base, setBase] = useState<string | null>(() => (value ? findBase(palette, value, mode) ?? value : null));
  useEffect(() => {
    if (!value) return;
    if (base && locateOnCurve(base, value, mode).off < 7) return;
    setBase(findBase(palette, value, mode) ?? value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const isCustom = !!value && !!base && !palette.some((p) => sameColor(p, base));
  const t = value && base ? locateOnCurve(base, value, mode).t : 0.5;
  const gradient = useMemo(() => (base ? curveGradient(base, mode) : undefined), [base, mode]);
  const sliderId = useId();

  return (
    <div className={s.colorControl}>
      <div className={s.swatchRow} role="group" aria-label={label}>
        {allowNone && (
          <button
            type="button"
            className={cx(s.swatch, s.swatchNone)}
            aria-pressed={value === null}
            aria-label={noneLabel}
            title={noneLabel}
            onClick={() => onChange(null)}
          >
            <Ban size={18} strokeWidth={1.8} aria-hidden />
          </button>
        )}
        {palette.map((p, i) => {
          const selected = !!value && !isCustom && sameColor(base, p);
          return (
            <button
              key={p}
              type="button"
              className={s.swatch}
              style={{ ["--sw" as string]: p }}
              aria-pressed={selected}
              aria-label={`Оттенок ${i + 1} из ${palette.length}`}
              title={p}
              onClick={() => {
                setBase(p);
                onChange(p);
              }}
            >
            </button>
          );
        })}
        <label
          className={cx(s.swatch, s.swatchCustom)}
          title="Свой цвет"
          data-selected={isCustom || undefined}
          style={isCustom && value ? { ["--sw" as string]: value } : undefined}
        >
          <input
            type="color"
            className="visually-hidden"
            aria-label="Свой цвет"
            value={(value ?? palette[0]).toLowerCase()}
            onChange={(e) => {
              const v = e.target.value.toUpperCase();
              setBase(v);
              onChange(v, "custom");
            }}
          />
          <Pipette size={15} strokeWidth={2} aria-hidden />
        </label>
      </div>

      {value && base && (
        <div className={s.shadeRow}>
          <label htmlFor={sliderId} className="visually-hidden">
            {sliderLabel ?? `${label}: светлее или темнее`}
          </label>
          <input
            id={sliderId}
            type="range"
            min={0}
            max={1000}
            step={1}
            value={Math.round(t * 1000)}
            className={s.shade}
            style={{ ["--track" as string]: gradient, ["--thumb" as string]: value }}
            aria-valuetext={t < 0.47 ? "Темнее" : t > 0.53 ? "Светлее" : "Исходный оттенок"}
            onChange={(e) => onChange(shadeAt(base, Number(e.target.value) / 1000, mode), "shade")}
          />
        </div>
      )}
    </div>
  );
}

// ── Unit slider (0..1) ────────────────────────────────────────────────────────

export function RangeField({
  label,
  value,
  onChange,
  min = "Меньше",
  max = "Больше",
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: string;
  max?: string;
}) {
  const id = useId();
  return (
    <div className={s.range}>
      <div className={s.rangeHead}>
        <label htmlFor={id} className={s.rangeLabel}>
          {label}
        </label>
        <span className={s.rangeValue} aria-hidden>
          {Math.round(value * 100)}%
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={0}
        max={100}
        step={1}
        value={Math.round(value * 100)}
        className={s.unit}
        style={{ ["--fill" as string]: `${value * 100}%` }}
        aria-valuetext={`${Math.round(value * 100)}%`}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
      />
      <div className={s.rangeEnds} aria-hidden>
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

// ── Option tiles with live thumbnails ─────────────────────────────────────────

export interface TileRender {
  framing?: Framing;
  expression?: Record<string, number>;
  yaw?: number;
  /** Crop into a feature like Apple does (eyes, nose, mouth): scale + focal point in % of the face shot. */
  zoom?: { scale: number; x: number; y: number };
}

export function OptionGrid<T extends string>({
  options,
  value,
  labels,
  preview,
  onSelect,
  render,
  ariaLabel,
}: {
  options: readonly T[];
  value: T;
  labels: Record<T, string>;
  /** config to picture for an option (built from the debounced config) */
  preview: (option: T) => AvatarConfig;
  onSelect: (v: T) => void;
  render?: TileRender;
  ariaLabel: string;
}) {
  return (
    <div className={s.tiles} role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <OptionTile key={o} label={labels[o]} selected={o === value} config={preview(o)} render={render} onClick={() => onSelect(o)} />
      ))}
    </div>
  );
}

const TILE_SIZE = 160;

function OptionTile({
  label,
  selected,
  config,
  render,
  onClick,
}: {
  label: string;
  selected: boolean;
  config: AvatarConfig;
  render?: TileRender;
  onClick: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState(false);
  const opts = useMemo(
    () => ({
      // render sharper when the tile crops into a feature
      size: Math.round(TILE_SIZE * Math.min(2, render?.zoom?.scale ?? 1)),
      framing: render?.framing ?? ("face" as Framing),
      expression: render?.expression,
      yaw: render?.yaw,
    }),
    [render],
  );
  const key = useMemo(() => thumbKey(config, opts), [config, opts]);
  const [src, setSrc] = useState<string | null>(() => cachedThumb(key) ?? null);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver((entries) => setVisible(entries.some((e) => e.isIntersecting)), { rootMargin: "120px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const hit = cachedThumb(key);
    if (hit) {
      setSrc(hit);
      setStale(false);
      return;
    }
    if (!visible) return;
    setStale(true);
    return requestThumb(config, opts, (url) => {
      if (url) setSrc(url);
      setStale(false);
    });
    // `key` captures config + opts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, visible]);

  return (
    <button ref={ref} type="button" className={s.tile} aria-pressed={selected} onClick={onClick}>
      <span className={s.tileArt} data-stale={(stale && !!src) || undefined}>
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt=""
            width={TILE_SIZE}
            height={TILE_SIZE}
            draggable={false}
            style={
              render?.zoom
                ? { transform: `scale(${render.zoom.scale})`, transformOrigin: `${render.zoom.x}% ${render.zoom.y}%` }
                : undefined
            }
          />
        ) : (
          <Skeleton width="100%" height="100%" radius={16} />
        )}
      </span>
      <span className={s.tileLabel}>{label}</span>
    </button>
  );
}
