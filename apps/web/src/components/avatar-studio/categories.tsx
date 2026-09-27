"use client";

import { EYE_COLORS, HAIR_COLORS, type AvatarConfig, type HeadzGroup, type HeadzSlot } from "@/lib/avatar/schema";
import { CATALOG, headzBase, headzOptions } from "@/lib/avatar/headz/catalog";
import { ColorControl, OptionGrid, Section, type TileRender } from "./controls";

export type Field = Exclude<keyof AvatarConfig, "version">;

export type SetField = <K extends Field>(
  k: K,
  v: AvatarConfig[K],
  /** history coalescing key: rapid changes with the same key are one undo step */
  key?: string,
) => void;

export interface CategoryProps {
  cfg: AvatarConfig;
  /** debounced config the thumbnails are drawn from */
  tileCfg: AvatarConfig;
  set: SetField;
}

export const GROUP_RU: Record<HeadzGroup, string> = {
  woman: "Женщина",
  man: "Мужчина",
  oldwoman: "Пожилая",
  oldman: "Пожилой",
  girl: "Девочка",
  boy: "Мальчик",
};
const GROUPS: HeadzGroup[] = ["woman", "man", "oldwoman", "oldman", "girl", "boy"];
const TONE_RU = { light: "Светлая", medium: "Смуглая", dark: "Тёмная" } as const;

const THREE_Q: TileRender = { yaw: 0.45 };

/** Switch base: keep what still exists for the new base (same group ⇒ same options). */
export function withBase(cfg: AvatarConfig, baseId: string): AvatarConfig {
  const b = headzBase(baseId);
  const keep = (slot: HeadzSlot) => (headzOptions(baseId, slot).some((o) => o.id === cfg[slot]) ? cfg[slot] : "none");
  const sameGroup = headzBase(cfg.base).group === b.group;
  return {
    ...cfg,
    base: baseId,
    hair: sameGroup && keep("hair") !== "none" ? cfg.hair : b.defaults.hair ?? "none",
    beard: sameGroup ? keep("beard") : b.defaults.beard ?? "none",
    eyewear: keep("eyewear"),
    headwear: keep("headwear"),
    earrings: keep("earrings"),
    skin: null,
  };
}

/** Short Russian names for part options (from the source object names). */
function partLabel(slot: HeadzSlot, id: string, i: number): string {
  const n = id.toLowerCase();
  if (slot === "hair") return `${i + 1}`;
  if (slot === "beard") return n.includes("mustache") || n.includes("moustache") ? `Усы ${i + 1}` : `Борода ${i + 1}`;
  if (slot === "eyewear") return `Очки ${i + 1}`;
  if (slot === "earrings") return `Серьги ${i + 1}`;
  if (n.includes("beanie")) return "Шапка";
  if (n.includes("cap")) return "Кепка";
  if (n.includes("hat")) return "Шляпа";
  return `${i + 1}`;
}

function PartGrid({ p, slot, title, render }: { p: CategoryProps; slot: HeadzSlot; title: string; render?: TileRender }) {
  const opts = headzOptions(p.cfg.base, slot);
  const ids = ["none", ...opts.map((o) => o.id)];
  const seen = new Map<string, number>();
  const labels: Record<string, string> = { none: "Нет" };
  opts.forEach((o, i) => {
    const l = partLabel(slot, o.id, i);
    const k = (seen.get(l) ?? 0) + 1;
    seen.set(l, k);
    labels[o.id] = k > 1 ? `${l} ${k}` : l;
  });
  return (
    <Section title={title}>
      <OptionGrid
        ariaLabel={title}
        options={ids}
        labels={labels}
        value={p.cfg[slot]}
        preview={(o) => ({ ...p.tileCfg, [slot]: o })}
        onSelect={(o) => p.set(slot, o)}
        render={render}
      />
    </Section>
  );
}

// ── Categories ────────────────────────────────────────────────────────────────

function Character(p: CategoryProps) {
  const cur = headzBase(p.cfg.base);
  const byGroup = (g: HeadzGroup) =>
    CATALOG.bases.find((b) => b.group === g && b.tone === cur.tone) ?? CATALOG.bases.find((b) => b.group === g)!;
  const groups = GROUPS.filter((g) => CATALOG.bases.some((b) => b.group === g));
  const groupBase = Object.fromEntries(groups.map((g) => [g, byGroup(g).id])) as Record<HeadzGroup, string>;
  const tones = CATALOG.bases.filter((b) => b.group === cur.group);
  return (
    <>
      <Section title="Персонаж">
        <OptionGrid
          ariaLabel="Персонаж"
          options={groups}
          labels={GROUP_RU}
          value={cur.group}
          preview={(g) => withBase(p.tileCfg, groupBase[g])}
          onSelect={(g) => p.set("base", groupBase[g])}
        />
      </Section>
      <Section title="Тон кожи">
        <OptionGrid
          ariaLabel="Тон кожи"
          options={tones.map((b) => b.id)}
          labels={Object.fromEntries(tones.map((b) => [b.id, TONE_RU[b.tone]]))}
          value={cur.id}
          preview={(id) => withBase(p.tileCfg, id)}
          onSelect={(id) => p.set("base", id)}
        />
        <div style={{ marginTop: 14 }} />
        <ColorControl
          label="Оттенок кожи"
          palette={[cur.skin]}
          mode="skin"
          sliderLabel="Оттенок кожи: темнее или&nbsp;светлее"
          value={p.cfg.skin ?? cur.skin}
          onChange={(v, key) => p.set("skin", v && v.toUpperCase() !== cur.skin.toUpperCase() ? v : null, key ? `skin:${key}` : undefined)}
        />
      </Section>
    </>
  );
}

function Hair(p: CategoryProps) {
  const base = headzBase(p.cfg.base);
  return (
    <>
      <PartGrid p={p} slot="hair" title="Причёска" render={THREE_Q} />
      {headzOptions(p.cfg.base, "hair").length > 0 && (
        <Section title="Цвет волос">
          <ColorControl
            label="Цвет волос"
            palette={HAIR_COLORS}
            allowNone
            noneLabel="Как у персонажа"
            value={p.cfg.hairColor}
            onChange={(v, key) => p.set("hairColor", v, key ? `hairColor:${key}` : undefined)}
          />
        </Section>
      )}
      {headzOptions(base.id, "beard").length > 0 && <PartGrid p={p} slot="beard" title="Борода и усы" />}
    </>
  );
}

function Eyes(p: CategoryProps) {
  return (
    <Section title="Цвет глаз">
      <ColorControl
        label="Цвет глаз"
        palette={EYE_COLORS}
        allowNone
        noneLabel="Как у персонажа"
        value={p.cfg.eyeColor}
        onChange={(v, key) => p.set("eyeColor", v, key ? `eyeColor:${key}` : undefined)}
      />
    </Section>
  );
}

function Accessories(p: CategoryProps) {
  const has = (s: HeadzSlot) => headzOptions(p.cfg.base, s).length > 0;
  return (
    <>
      {has("eyewear") && <PartGrid p={p} slot="eyewear" title="Очки" />}
      {has("headwear") && <PartGrid p={p} slot="headwear" title="Головной убор" render={THREE_Q} />}
      {has("earrings") && <PartGrid p={p} slot="earrings" title="Серьги" render={THREE_Q} />}
    </>
  );
}

export const CATEGORIES: { id: string; label: string; Panel: (p: CategoryProps) => JSX.Element }[] = [
  { id: "character", label: "Персонаж", Panel: Character },
  { id: "hair", label: "Волосы", Panel: Hair },
  { id: "eyes", label: "Глаза", Panel: Eyes },
  { id: "accessories", label: "Аксессуары", Panel: Accessories },
];
