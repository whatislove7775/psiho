"use client";

import {
  ACC_COLORS,
  BROW_STYLES,
  EYE_COLORS,
  HAIR_COLORS,
  IRIS_STYLES,
  LIP_COLORS,
  PIERCINGS,
  SHADOW_COLORS,
  SKIN_TONES,
  baseDefault,
  nearestTone,
  normalizeAvatar,
  type AvatarConfig,
  type FaceShape,
  type HeadzGroup,
  type HeadzSlot,
} from "@/lib/avatar/schema";
import { CATALOG, headzBase, headzOptionsAll, requalify } from "@/lib/avatar/headz/catalog";
import { ColorControl, OptionGrid, RangeField, Section, SignedSlider, type TileRender } from "./controls";
import s from "./AvatarStudio.module.css";

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
const SLOTS: HeadzSlot[] = ["hair", "beard", "eyewear", "headwear", "earrings", "mask"];

const THREE_Q: TileRender = { yaw: 0.45 };
const EYES_ZOOM: TileRender = { zoom: { scale: 2.2, x: 50, y: 47 } };
const MOUTH_ZOOM: TileRender = { zoom: { scale: 2, x: 50, y: 72 } };

type Sex = "m" | "f";
type Age = "young" | "adult" | "old";
const GROUP_OF: Record<Sex, Record<Age, HeadzGroup>> = {
  m: { young: "boy", adult: "man", old: "oldman" },
  f: { young: "girl", adult: "woman", old: "oldwoman" },
};
const sexOf = (g: HeadzGroup): Sex => (g === "woman" || g === "girl" || g === "oldwoman" ? "f" : "m");
const ageOf = (g: HeadzGroup): Age => (g === "boy" || g === "girl" ? "young" : g === "oldman" || g === "oldwoman" ? "old" : "adult");
/** only groups whose faces the beards were made for (adult men, elders) and adult women */
const BEARD_OK = new Set<HeadzGroup>(["man", "oldman", "woman", "oldwoman"]);

/**
 * Switch base. Within the same group everything stays. Across groups the look
 * that isn't tied to the head stays (skin, eyes, brows, face sliders, colours,
 * make-up); parts reset to the new character's own: its hair, no beard on kids,
 * accessories kept only when they belong to the new group.
 */
export function withBase(cfg: AvatarConfig, baseId: string): AvatarConfig {
  const from = headzBase(cfg.base).group;
  const to = headzBase(baseId).group;
  // same group: everything stays, except parts that don't fit the new head (→ its default / none)
  if (from === to) return normalizeAvatar({ ...cfg, base: baseId });
  const own = (slot: HeadzSlot) => {
    const q = requalify(cfg.base, baseId, slot, cfg[slot]);
    return q.includes(".") ? "none" : q;
  };
  return normalizeAvatar({
    ...cfg,
    base: baseId,
    hair: headzBase(baseId).defaults.hair ?? "none",
    beard: BEARD_OK.has(to) && (to === "man" || to === "oldman") ? requalify(cfg.base, baseId, "beard", cfg.beard) : "none",
    eyewear: own("eyewear"),
    headwear: own("headwear"),
    earrings: own("earrings"),
    mask: own("mask"),
  });
}

/** Short Russian names for part options. */
function partLabel(slot: HeadzSlot, id: string, i: number): string {
  const n = id.toLowerCase();
  if (slot === "hair") return `${i + 1}`;
  if (slot === "beard") return n.includes("mustache") || n.includes("moustache") ? "Усы" : "Борода";
  if (slot === "eyewear") return "Очки";
  if (slot === "earrings") return "Серьги";
  if (slot === "mask") return "Маска";
  if (n.includes("beanie")) return "Шапка";
  if (n.includes("cap")) return "Кепка";
  if (n.includes("hat")) return "Шляпа";
  return `${i + 1}`;
}

function PartGrid({ p, slot, title, render, allGroups = true }: { p: CategoryProps; slot: HeadzSlot; title: string; render?: TileRender; allGroups?: boolean }) {
  const own = headzBase(p.cfg.base).group;
  const opts = headzOptionsAll(p.cfg.base, slot).filter((o) => allGroups || o.group === own);
  const ids = ["none", ...opts.map((o) => o.qid)];
  const seen = new Map<string, number>();
  const labels: Record<string, string> = { none: "Нет" };
  opts.forEach((o, i) => {
    const l = slot === "hair" ? `${i + 1}` : partLabel(slot, o.option.id, i);
    const k = (seen.get(l) ?? 0) + 1;
    seen.set(l, k);
    labels[o.qid] = k > 1 || slot !== "hair" ? `${l} ${k}` : l;
  });
  if (opts.length === 0) return null;
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

/** Small segmented choice (text chips) — for styles that don't need a picture. */
function Chips<T extends string>({ label, options, labels, value, onChange }: { label: string; options: readonly T[]; labels: Record<T, string>; value: T; onChange: (v: T) => void }) {
  return (
    <div className={s.chips} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o} type="button" role="radio" aria-checked={o === value} className={s.chip} onClick={() => onChange(o)}>
          {labels[o]}
        </button>
      ))}
    </div>
  );
}

// ── Лицо ──────────────────────────────────────────────────────────────────────

const FACE_SLIDERS: { title: string; items: [FaceShape, string][] }[] = [
  { title: "Голова", items: [["headWidth", "Ширина головы"], ["faceLength", "Длина лица"], ["jaw", "Ширина челюсти"], ["chin", "Подбородок"], ["cheeks", "Щёки"], ["ears", "Уши"]] },
  { title: "Глаза и брови", items: [["eyeSize", "Размер глаз"], ["eyeSpacing", "Посадка глаз"], ["browHeight", "Высота бровей"]] },
  { title: "Нос и рот", items: [["noseSize", "Размер носа"], ["noseWidth", "Ширина носа"], ["noseLength", "Длина носа"], ["lips", "Губы"], ["mouthWidth", "Ширина рта"]] },
];

function Face(p: CategoryProps) {
  const cur = headzBase(p.cfg.base);
  const sex = sexOf(cur.group), age = ageOf(cur.group);
  // same tone family when switching character, the variant tiles pick the face
  const pick = (g: HeadzGroup) => (CATALOG.bases.find((b) => b.group === g && b.tone === cur.tone) ?? CATALOG.bases.find((b) => b.group === g))?.id;
  const go = (s2: Sex, a2: Age) => {
    const id = pick(GROUP_OF[s2][a2]);
    if (id && id !== cur.id) p.set("base", id);
  };
  const variants = CATALOG.bases.filter((b) => b.group === cur.group);
  const setFace = (k: FaceShape, v: number) => {
    const face = { ...p.cfg.face, [k]: v };
    if (!v) delete face[k];
    p.set("face", face, `face:${k}`);
  };
  return (
    <>
      <Section title="Персонаж">
        <div className={s.pickRows}>
          <div className={s.inlineRow} style={{ marginTop: 0 }}>
            <span className={s.rangeLabel}>Пол</span>
            <Chips label="Пол" options={["m", "f"] as const} labels={{ m: "Мужской", f: "Женский" }} value={sex} onChange={(v) => go(v, age)} />
          </div>
          <div className={s.inlineRow} style={{ marginTop: 0 }}>
            <span className={s.rangeLabel}>Возраст</span>
            <Chips label="Возраст" options={["young", "adult", "old"] as const} labels={{ young: "Молодой", adult: "Средний", old: "Пожилой" }} value={age} onChange={(v) => go(sex, v)} />
          </div>
        </div>
      </Section>
      <Section title="Черты лица">
        <OptionGrid
          ariaLabel="Черты лица"
          options={variants.map((b) => b.id)}
          labels={Object.fromEntries(variants.map((b, i) => [b.id, `Вариант ${i + 1}`]))}
          value={cur.id}
          // each variant as sold — its own hair and colours, none of the current parts
          preview={(id) => baseDefault(id)}
          onSelect={(id) => p.set("base", id)}
        />
      </Section>
      {FACE_SLIDERS.map((g) => (
        <Section
          key={g.title}
          title={g.title}
          aside={
            g.items.some(([k]) => p.cfg.face[k]) ? (
              <button type="button" className={s.linkBtn} onClick={() => p.set("face", Object.fromEntries(Object.entries(p.cfg.face).filter(([k]) => !g.items.some(([x]) => x === k))))}>
                Сбросить
              </button>
            ) : undefined
          }
        >
          <div className={s.sliders}>
            {g.items.map(([k, label]) => (
              <SignedSlider key={k} label={label} value={p.cfg.face[k] ?? 0} onChange={(v) => setFace(k, v)} />
            ))}
          </div>
        </Section>
      ))}
    </>
  );
}

// ── Кожа ──────────────────────────────────────────────────────────────────────

function Skin(p: CategoryProps) {
  const cur = headzBase(p.cfg.base);
  const fx = p.cfg.skinFx;
  const setFx = (k: keyof AvatarConfig["skinFx"], v: number) => p.set("skinFx", { ...fx, [k]: v }, `skinFx:${k}`);
  return (
    <>
      <Section title="Тон кожи">
        <ColorControl
          label="Тон кожи"
          palette={SKIN_TONES}
          mode="skin"
          sliderLabel="Тон кожи: темнее или&nbsp;светлее"
          value={p.cfg.skin ?? nearestTone(cur.skin)}
          onChange={(v, key) => p.set("skin", v, key ? `skin:${key}` : undefined)}
        />
      </Section>
      <Section title="Детали">
        <div className={s.sliders}>
          <RangeField label="Румянец" value={fx.blush} onChange={(v) => setFx("blush", v)} min="Нет" max="Ярко" />
          <RangeField label="Веснушки" value={fx.freckles} onChange={(v) => setFx("freckles", v)} min="Нет" max="Много" />
          <RangeField label="Морщинки" value={fx.age} onChange={(v) => setFx("age", v)} min="Нет" max="Заметные" />
        </div>
        <div className={s.inlineRow}>
          <span className={s.rangeLabel}>Родинки</span>
          <Chips label="Родинки" options={["0", "1", "2", "3"] as const} labels={{ 0: "Нет", 1: "1", 2: "2", 3: "3" }} value={String(fx.moles) as "0"} onChange={(v) => setFx("moles", Number(v))} />
        </div>
      </Section>
    </>
  );
}

// ── Глаза ─────────────────────────────────────────────────────────────────────

const IRIS_RU: Record<(typeof IRIS_STYLES)[number], string> = { natural: "Живые", ring: "С ободком", cartoon: "Мульт", bright: "Лучистые" };

function Eyes(p: CategoryProps) {
  return (
    <>
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
      <Section title="Радужка">
        <OptionGrid
          ariaLabel="Радужка"
          options={IRIS_STYLES}
          labels={IRIS_RU}
          value={p.cfg.eyes.style}
          preview={(o) => ({ ...p.tileCfg, eyes: { ...p.tileCfg.eyes, style: o } })}
          onSelect={(o) => p.set("eyes", { ...p.cfg.eyes, style: o })}
          render={EYES_ZOOM}
        />
      </Section>
      <Section title="Форма">
        <div className={s.sliders}>
          <SignedSlider label="Ресницы" value={p.cfg.eyes.lashes} onChange={(v) => p.set("eyes", { ...p.cfg.eyes, lashes: v }, "lashes")} min="Короче" max="Длиннее" />
          <SignedSlider label="Размер глаз" value={p.cfg.face.eyeSize ?? 0} onChange={(v) => p.set("face", { ...p.cfg.face, eyeSize: v }, "face:eyeSize")} />
          <SignedSlider label="Посадка глаз" value={p.cfg.face.eyeSpacing ?? 0} onChange={(v) => p.set("face", { ...p.cfg.face, eyeSpacing: v }, "face:eyeSpacing")} min="Ближе" max="Шире" />
        </div>
      </Section>
    </>
  );
}

// ── Брови ─────────────────────────────────────────────────────────────────────

const BROW_RU: Record<(typeof BROW_STYLES)[number], string> = { natural: "Как есть", straight: "Прямые", arched: "Дугой", angled: "С изломом", soft: "Мягкие", raised: "Приподнятые" };

function Brows(p: CategoryProps) {
  const b = p.cfg.brows;
  return (
    <>
      <Section title="Форма бровей">
        <OptionGrid
          ariaLabel="Форма бровей"
          options={BROW_STYLES}
          labels={BROW_RU}
          value={b.style}
          preview={(o) => ({ ...p.tileCfg, brows: { ...p.tileCfg.brows, style: o } })}
          onSelect={(o) => p.set("brows", { ...b, style: o })}
          render={EYES_ZOOM}
        />
        <div className={s.sliders} style={{ marginTop: 16 }}>
          <SignedSlider label="Толщина" value={b.thickness} onChange={(v) => p.set("brows", { ...b, thickness: v }, "brows:thickness")} min="Тоньше" max="Гуще" />
          <SignedSlider label="Высота" value={p.cfg.face.browHeight ?? 0} onChange={(v) => p.set("face", { ...p.cfg.face, browHeight: v }, "face:browHeight")} min="Ниже" max="Выше" />
        </div>
      </Section>
      <Section title="Цвет бровей">
        <ColorControl label="Цвет бровей" palette={HAIR_COLORS} allowNone noneLabel="Как волосы" value={b.color} onChange={(v, key) => p.set("brows", { ...b, color: v }, key ? `brows:${key}` : undefined)} />
      </Section>
    </>
  );
}

// ── Волосы ────────────────────────────────────────────────────────────────────

function Hair(p: CategoryProps) {
  return (
    <>
      <PartGrid p={p} slot="hair" title="Причёска" render={THREE_Q} />
      <Section title="Цвет волос">
        <ColorControl label="Цвет волос" palette={HAIR_COLORS} allowNone noneLabel="Как у персонажа" value={p.cfg.hairColor} onChange={(v, key) => p.set("hairColor", v, key ? `hairColor:${key}` : undefined)} />
      </Section>
      <Section
        title="Второй цвет"
        aside={
          p.cfg.hairTip ? (
            <Chips label="Как окрасить" options={["tips", "streaks"] as const} labels={{ tips: "Кончики", streaks: "Пряди" }} value={p.cfg.hairTipStyle} onChange={(v) => p.set("hairTipStyle", v)} />
          ) : undefined
        }
      >
        <ColorControl label="Второй цвет волос" palette={HAIR_COLORS} allowNone noneLabel="Без окрашивания" value={p.cfg.hairTip} onChange={(v, key) => p.set("hairTip", v, key ? `hairTip:${key}` : undefined)} />
      </Section>
    </>
  );
}

// ── Борода ────────────────────────────────────────────────────────────────────

function Beard(p: CategoryProps) {
  if (!BEARD_OK.has(headzBase(p.cfg.base).group))
    return (
      <Section title="Борода и усы">
        <p className={s.note}>Для детских персонажей бороды нет.</p>
      </Section>
    );
  return (
    <>
      <PartGrid p={p} slot="beard" title="Борода и усы" render={MOUTH_ZOOM} />
      {p.cfg.beard !== "none" && (
        <Section title="Цвет бороды">
          <ColorControl label="Цвет бороды" palette={HAIR_COLORS} allowNone noneLabel="Как волосы" value={p.cfg.beardColor} onChange={(v, key) => p.set("beardColor", v, key ? `beardColor:${key}` : undefined)} />
        </Section>
      )}
    </>
  );
}

// ── Макияж ────────────────────────────────────────────────────────────────────

function Makeup(p: CategoryProps) {
  const m = p.cfg.makeup;
  const set = (patch: Partial<AvatarConfig["makeup"]>, key?: string) => p.set("makeup", { ...m, ...patch }, key);
  return (
    <>
      <Section title="Помада">
        <ColorControl label="Помада" palette={LIP_COLORS} allowNone noneLabel="Без помады" value={m.lip} onChange={(v, key) => set({ lip: v }, key ? `lip:${key}` : undefined)} />
        {m.lip && <RangeField label="Насыщенность" value={m.lipAmount} onChange={(v) => set({ lipAmount: v }, "lipAmount")} min="Легко" max="Ярко" />}
      </Section>
      <Section title="Тени">
        <ColorControl label="Тени" palette={SHADOW_COLORS} allowNone noneLabel="Без теней" value={m.shadow} onChange={(v, key) => set({ shadow: v }, key ? `shadow:${key}` : undefined)} />
        {m.shadow && <RangeField label="Насыщенность" value={m.shadowAmount} onChange={(v) => set({ shadowAmount: v }, "shadowAmount")} min="Легко" max="Ярко" />}
      </Section>
      <Section title="Подводка">
        <RangeField label="Подводка" value={m.liner} onChange={(v) => set({ liner: v }, "liner")} min="Нет" max="Чётко" />
      </Section>
    </>
  );
}

// ── Аксессуары ────────────────────────────────────────────────────────────────

const PIERCING_RU: Record<(typeof PIERCINGS)[number], string> = { nose: "Нос", septum: "Септум", lip: "Губа", brow: "Бровь" };

function Accessories(p: CategoryProps) {
  const a = p.cfg.acc;
  const setAcc = (patch: Partial<AvatarConfig["acc"]>, key?: string) => p.set("acc", { ...a, ...patch }, key);
  return (
    <>
      <PartGrid p={p} slot="eyewear" title="Очки" allGroups={false} />
      {p.cfg.eyewear !== "none" && (
        <Section title="Оправа и стёкла">
          <ColorControl label="Цвет оправы" palette={ACC_COLORS} allowNone noneLabel="Как есть" value={a.frame} onChange={(v, key) => setAcc({ frame: v }, key ? `frame:${key}` : undefined)} />
          <div style={{ marginTop: 14 }} />
          <ColorControl label="Тон стёкол" palette={["#3A6DF0", "#2FB57C", "#F2C94C", "#E85BA8", "#6A4FE8", "#1B1B1F"]} allowNone noneLabel="Прозрачные" value={a.lens} onChange={(v, key) => setAcc({ lens: v }, key ? `lens:${key}` : undefined)} />
        </Section>
      )}
      <PartGrid p={p} slot="headwear" title="Головной убор" render={THREE_Q} />
      {p.cfg.headwear !== "none" && (
        <Section title="Цвет головного убора">
          <ColorControl label="Цвет головного убора" palette={ACC_COLORS} allowNone noneLabel="Как есть" value={a.hat} onChange={(v, key) => setAcc({ hat: v }, key ? `hat:${key}` : undefined)} />
        </Section>
      )}
      <PartGrid p={p} slot="earrings" title="Серьги" render={THREE_Q} />
      <Section title="Пирсинг">
        <div className={s.chips} role="group" aria-label="Пирсинг">
          {PIERCINGS.map((k) => {
            const on = a.piercings.includes(k);
            return (
              <button key={k} type="button" aria-pressed={on} className={s.chip} onClick={() => setAcc({ piercings: on ? a.piercings.filter((x) => x !== k) : PIERCINGS.filter((x) => x === k || a.piercings.includes(x)) })}>
                {PIERCING_RU[k]}
              </button>
            );
          })}
        </div>
      </Section>
      <PartGrid p={p} slot="mask" title="Маска" render={MOUTH_ZOOM} />
    </>
  );
}

export const CATEGORIES: { id: string; label: string; Panel: (p: CategoryProps) => JSX.Element }[] = [
  { id: "face", label: "Лицо", Panel: Face },
  { id: "skin", label: "Кожа", Panel: Skin },
  { id: "eyes", label: "Глаза", Panel: Eyes },
  { id: "brows", label: "Брови", Panel: Brows },
  { id: "hair", label: "Волосы", Panel: Hair },
  { id: "beard", label: "Борода", Panel: Beard },
  { id: "makeup", label: "Макияж", Panel: Makeup },
  { id: "accessories", label: "Аксессуары", Panel: Accessories },
];
