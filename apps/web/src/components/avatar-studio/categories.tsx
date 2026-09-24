"use client";

import { useState } from "react";
import { Segmented } from "@/ui";
import {
  ACCENT_COLORS,
  AGE_LOOKS,
  BROW_STYLES,
  CHIN_SHAPES,
  EAR_SIZES,
  EARRING_STYLES,
  EYE_COLORS,
  EYE_SHAPES,
  EYEWEAR,
  FACIAL_HAIR,
  FRECKLES,
  HAIR_COLORS,
  HAIR_STYLES,
  HEAD_SHAPES,
  HEADWEAR,
  LASH_STYLES,
  LIP_COLORS,
  METAL_COLORS,
  MOLES,
  MOUTH_SHAPES,
  NOSE_PIERCINGS,
  NOSE_SHAPES,
  OUTFITS,
  SKIN_TONES,
  TEETH_STYLES,
  type AvatarConfig,
} from "@/lib/avatar/schema";
import { ColorControl, OptionGrid, RangeField, Section, type TileRender } from "./controls";
import * as RU from "./labels";

export type Group = Exclude<keyof AvatarConfig, "version">;

/** Immutable single-field update. */
export function withField<G extends Group, K extends keyof AvatarConfig[G]>(
  cfg: AvatarConfig,
  g: G,
  k: K,
  v: AvatarConfig[G][K],
): AvatarConfig {
  return { ...cfg, [g]: { ...cfg[g], [k]: v } };
}

export type SetField = <G extends Group, K extends keyof AvatarConfig[G]>(
  g: G,
  k: K,
  v: AvatarConfig[G][K],
  /** history coalescing key: rapid changes with the same key are one undo step */
  key?: string,
) => void;

export interface CategoryProps {
  cfg: AvatarConfig;
  /** debounced config the thumbnails are drawn from */
  tileCfg: AvatarConfig;
  set: SetField;
}

/** Eyeshadow shades: soft mattes, a couple of jewel tones. */
const SHADOW_COLORS = ["#B08A78", "#8C6A5A", "#C9A27A", "#D4AF37", "#9C6B8A", "#7A5A9C", "#4E6A9C", "#5E8A6A", "#C97A6A", "#3B2A2E"];

const EYES_ZOOM: TileRender = { zoom: { scale: 1.9, x: 50, y: 56 } };
const BROWS_ZOOM: TileRender = { zoom: { scale: 1.8, x: 50, y: 38 } };
const NOSE_ZOOM: TileRender = { zoom: { scale: 1.9, x: 50, y: 80 } };
const MOUTH_ZOOM: TileRender = { zoom: { scale: 2, x: 50, y: 92 } };
const TEETH_SHOW: TileRender = { ...MOUTH_ZOOM, expression: { mouthSmileLeft: 0.7, mouthSmileRight: 0.7, jawOpen: 0.22 } };
const PORTRAIT: TileRender = { framing: "portrait" };
/** Three-quarter view where the back/side matters (ponytails, buns, earrings, hats). */
const THREE_Q: TileRender = { yaw: 0.45 };

function tiles<G extends Group, K extends keyof AvatarConfig[G]>(p: CategoryProps, g: G, k: K) {
  return {
    value: p.cfg[g][k] as AvatarConfig[G][K] & string,
    preview: (o: string) => withField(p.tileCfg, g, k, o as AvatarConfig[G][K]),
    onSelect: (o: string) => p.set(g, k, o as AvatarConfig[G][K]),
  };
}

function color<G extends Group, K extends keyof AvatarConfig[G]>(p: CategoryProps, g: G, k: K) {
  return {
    value: p.cfg[g][k] as unknown as string | null,
    onChange: (v: string | null, key?: string) =>
      p.set(g, k, v as AvatarConfig[G][K], key ? `${String(g)}.${String(k)}:${key}` : undefined),
  };
}

function unit<G extends Group, K extends keyof AvatarConfig[G]>(p: CategoryProps, g: G, k: K) {
  return {
    value: p.cfg[g][k] as unknown as number,
    onChange: (v: number) => p.set(g, k, v as AvatarConfig[G][K], `${String(g)}.${String(k)}`),
  };
}

// ── Categories ────────────────────────────────────────────────────────────────

function Skin(p: CategoryProps) {
  return (
    <>
      <Section title="Тон кожи">
        <ColorControl label="Тон кожи" palette={SKIN_TONES} mode="skin" sliderLabel="Тон кожи: темнее и теплее или светлее" {...color(p, "skin", "tone")} />
      </Section>
      <Section title="Румянец">
        <RangeField label="Насколько заметен" min="Нет" max="Ярко" {...unit(p, "skin", "blush")} />
      </Section>
      <Section title="Веснушки">
        <OptionGrid ariaLabel="Веснушки" options={FRECKLES} labels={RU.FRECKLES_RU} {...tiles(p, "skin", "freckles")} />
      </Section>
      <Section title="Родинка">
        <OptionGrid ariaLabel="Родинка" options={MOLES} labels={RU.MOLE_RU} {...tiles(p, "skin", "mole")} />
      </Section>
      <Section title="Возраст">
        <OptionGrid ariaLabel="Возраст" options={AGE_LOOKS} labels={RU.AGE_RU} {...tiles(p, "skin", "age")} />
      </Section>
    </>
  );
}

function Head(p: CategoryProps) {
  return (
    <>
      <Section title="Форма">
        <OptionGrid ariaLabel="Форма головы" options={HEAD_SHAPES} labels={RU.HEAD_SHAPE_RU} {...tiles(p, "head", "shape")} />
      </Section>
      <Section title="Подбородок">
        <OptionGrid ariaLabel="Подбородок" options={CHIN_SHAPES} labels={RU.CHIN_RU} {...tiles(p, "head", "chin")} />
      </Section>
      <Section title="Щёки">
        <RangeField label="Полнота щёк" min="Худые" max="Пухлые" {...unit(p, "head", "cheeks")} />
      </Section>
    </>
  );
}

function Hair(p: CategoryProps) {
  return (
    <>
      <Section title="Цвет волос">
        <ColorControl label="Цвет волос" palette={HAIR_COLORS} {...color(p, "hair", "color")} />
      </Section>
      <Section title="Причёска">
        <OptionGrid ariaLabel="Причёска" options={HAIR_STYLES} labels={RU.HAIR_RU} render={THREE_Q} {...tiles(p, "hair", "style")} />
      </Section>
      <Section title="Мелирование">
        <ColorControl label="Мелирование" palette={HAIR_COLORS} allowNone noneLabel="Без мелирования" {...color(p, "hair", "highlight")} />
      </Section>
    </>
  );
}

function Brows(p: CategoryProps) {
  return (
    <>
      <Section title="Цвет бровей">
        <ColorControl label="Цвет бровей" palette={HAIR_COLORS} {...color(p, "brows", "color")} />
      </Section>
      <Section title="Форма">
        <OptionGrid ariaLabel="Форма бровей" options={BROW_STYLES} labels={RU.BROW_RU} render={BROWS_ZOOM} {...tiles(p, "brows", "style")} />
      </Section>
      {p.cfg.brows.style !== "none" && (
        <Section title="Толщина">
          <RangeField label="Толщина бровей" min="Тоньше" max="Гуще" {...unit(p, "brows", "weight")} />
        </Section>
      )}
    </>
  );
}

function Eyes(p: CategoryProps) {
  return (
    <>
      <Section title="Цвет глаз">
        <ColorControl label="Цвет глаз" palette={EYE_COLORS} {...color(p, "eyes", "color")} />
      </Section>
      <Section title="Форма">
        <OptionGrid ariaLabel="Форма глаз" options={EYE_SHAPES} labels={RU.EYE_SHAPE_RU} render={EYES_ZOOM} {...tiles(p, "eyes", "shape")} />
      </Section>
      <Section title="Размер">
        <RangeField label="Размер глаз" {...unit(p, "eyes", "size")} />
      </Section>
      <Section title="Ресницы">
        <OptionGrid ariaLabel="Ресницы" options={LASH_STYLES} labels={RU.LASH_RU} render={EYES_ZOOM} {...tiles(p, "eyes", "lashes")} />
      </Section>
      <Section title="Тени для век">
        <ColorControl label="Тени для век" palette={SHADOW_COLORS} allowNone noneLabel="Без теней" {...color(p, "eyes", "shadow")} />
      </Section>
    </>
  );
}

function Nose(p: CategoryProps) {
  return (
    <>
      <Section title="Форма">
        <OptionGrid ariaLabel="Форма носа" options={NOSE_SHAPES} labels={RU.NOSE_RU} render={NOSE_ZOOM} {...tiles(p, "nose", "shape")} />
      </Section>
      <Section title="Размер">
        <RangeField label="Размер носа" {...unit(p, "nose", "size")} />
      </Section>
      <Section title="Пирсинг">
        <OptionGrid ariaLabel="Пирсинг носа" options={NOSE_PIERCINGS} labels={RU.PIERCING_RU} render={NOSE_ZOOM} {...tiles(p, "nose", "piercing")} />
      </Section>
    </>
  );
}

function Mouth(p: CategoryProps) {
  return (
    <>
      <Section title="Цвет губ">
        <ColorControl label="Цвет губ" palette={LIP_COLORS} {...color(p, "mouth", "lipColor")} />
      </Section>
      <Section title="Форма">
        <OptionGrid ariaLabel="Форма губ" options={MOUTH_SHAPES} labels={RU.MOUTH_RU} render={MOUTH_ZOOM} {...tiles(p, "mouth", "shape")} />
      </Section>
      <Section title="Зубы">
        <OptionGrid ariaLabel="Зубы" options={TEETH_STYLES} labels={RU.TEETH_RU} render={TEETH_SHOW} {...tiles(p, "mouth", "teeth")} />
      </Section>
    </>
  );
}

function Ears(p: CategoryProps) {
  return (
    <>
      <Section title="Размер">
        <OptionGrid ariaLabel="Размер ушей" options={EAR_SIZES} labels={RU.EAR_RU} render={THREE_Q} {...tiles(p, "ears", "size")} />
      </Section>
      <Section title="Серьги">
        <OptionGrid ariaLabel="Серьги" options={EARRING_STYLES} labels={RU.EARRING_RU} render={THREE_Q} {...tiles(p, "ears", "earrings")} />
      </Section>
      {p.cfg.ears.earrings !== "none" && (
        <Section title="Металл">
          <ColorControl label="Цвет серёг" palette={METAL_COLORS} {...color(p, "ears", "earringColor")} />
        </Section>
      )}
    </>
  );
}

function FacialHairCat(p: CategoryProps) {
  return (
    <>
      {p.cfg.facialHair.style !== "none" && (
        <Section title="Цвет">
          <ColorControl label="Цвет бороды и усов" palette={HAIR_COLORS} {...color(p, "facialHair", "color")} />
        </Section>
      )}
      <Section title="Стиль">
        <OptionGrid ariaLabel="Борода и усы" options={FACIAL_HAIR} labels={RU.FACIAL_HAIR_RU} {...tiles(p, "facialHair", "style")} />
      </Section>
    </>
  );
}

function EyewearCat(p: CategoryProps) {
  const [part, setPart] = useState<"frame" | "lens">("frame");
  const has = p.cfg.eyewear.style !== "none";
  return (
    <>
      {has && (
        <Section
          title={part === "frame" ? "Цвет оправы" : "Цвет линз"}
          aside={
            <Segmented
              ariaLabel="Что красим"
              value={part}
              onChange={setPart}
              options={[
                { value: "frame", label: "Оправа" },
                { value: "lens", label: "Линзы" },
              ]}
            />
          }
        >
          {part === "frame" ? (
            <ColorControl key="frame" label="Цвет оправы" palette={ACCENT_COLORS} {...color(p, "eyewear", "frameColor")} />
          ) : (
            <>
              <ColorControl key="lens" label="Цвет линз" palette={ACCENT_COLORS} {...color(p, "eyewear", "lensColor")} />
              <RangeField label="Затемнение" min="Прозрачные" max="Тёмные" {...unit(p, "eyewear", "tint")} />
            </>
          )}
        </Section>
      )}
      <Section title="Очки">
        <OptionGrid ariaLabel="Очки" options={EYEWEAR} labels={RU.EYEWEAR_RU} {...tiles(p, "eyewear", "style")} />
      </Section>
    </>
  );
}

function HeadwearCat(p: CategoryProps) {
  return (
    <>
      {p.cfg.headwear.style !== "none" && (
        <Section title="Цвет">
          <ColorControl label="Цвет головного убора" palette={ACCENT_COLORS} {...color(p, "headwear", "color")} />
        </Section>
      )}
      <Section title="Головной убор">
        <OptionGrid ariaLabel="Головной убор" options={HEADWEAR} labels={RU.HEADWEAR_RU} render={THREE_Q} {...tiles(p, "headwear", "style")} />
      </Section>
    </>
  );
}

function MakeupCat(p: CategoryProps) {
  return (
    <>
      <Section title="Помада">
        <ColorControl label="Цвет губ" palette={LIP_COLORS} {...color(p, "mouth", "lipColor")} />
      </Section>
      <Section title="Тени для век">
        <ColorControl label="Тени для век" palette={SHADOW_COLORS} allowNone noneLabel="Без теней" {...color(p, "eyes", "shadow")} />
      </Section>
      <Section title="Румяна">
        <RangeField label="Румяна" min="Нет" max="Ярко" {...unit(p, "skin", "blush")} />
      </Section>
      <Section title="Ресницы и подводка">
        <OptionGrid ariaLabel="Ресницы и подводка" options={LASH_STYLES} labels={RU.LASH_RU} render={EYES_ZOOM} {...tiles(p, "eyes", "lashes")} />
      </Section>
    </>
  );
}

export const CATEGORIES: { id: string; label: string; Panel: (p: CategoryProps) => JSX.Element }[] = [
  { id: "skin", label: "Кожа", Panel: Skin },
  { id: "head", label: "Форма головы", Panel: Head },
  { id: "hair", label: "Причёска", Panel: Hair },
  { id: "brows", label: "Брови", Panel: Brows },
  { id: "eyes", label: "Глаза", Panel: Eyes },
  { id: "nose", label: "Нос", Panel: Nose },
  { id: "mouth", label: "Рот", Panel: Mouth },
  { id: "ears", label: "Уши", Panel: Ears },
  { id: "facial-hair", label: "Борода и усы", Panel: FacialHairCat },
  { id: "eyewear", label: "Очки", Panel: EyewearCat },
  { id: "headwear", label: "Головной убор", Panel: HeadwearCat },
  { id: "makeup", label: "Макияж", Panel: MakeupCat },
];
