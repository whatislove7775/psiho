"use client";

import { t, msg } from "@/lib/i18n";
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
import {
  CATALOG,
  headzBase,
  headzOptionsAll,
  requalify,
} from "@/lib/avatar/headz/catalog";
import {
  ColorControl,
  OptionGrid,
  RangeField,
  Section,
  SignedSlider,
  type TileRender,
} from "./controls";
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
  get woman() {
    return t("Женщина");
  },
  get man() {
    return t("Мужчина");
  },
  get oldwoman() {
    return t("Пожилая");
  },
  get oldman() {
    return t("Пожилой");
  },
  get girl() {
    return t("Девочка");
  },
  get boy() {
    return t("Мальчик");
  },
};
const SLOTS: HeadzSlot[] = [
  "hair",
  "beard",
  "eyewear",
  "headwear",
  "earrings",
  "mask",
];

const THREE_Q: TileRender = { yaw: 0.45 };
const EYES_ZOOM: TileRender = { zoom: { scale: 2.2, x: 50, y: 47 } };
const MOUTH_ZOOM: TileRender = { zoom: { scale: 2, x: 50, y: 72 } };

type Sex = "m" | "f";
type Age = "young" | "adult" | "old";
const GROUP_OF: Record<Sex, Record<Age, HeadzGroup>> = {
  m: { young: "boy", adult: "man", old: "oldman" },
  f: { young: "girl", adult: "woman", old: "oldwoman" },
};
const sexOf = (g: HeadzGroup): Sex =>
  g === "woman" || g === "girl" || g === "oldwoman" ? "f" : "m";
const ageOf = (g: HeadzGroup): Age =>
  g === "boy" || g === "girl"
    ? "young"
    : g === "oldman" || g === "oldwoman"
      ? "old"
      : "adult";
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
    beard:
      BEARD_OK.has(to) && (to === "man" || to === "oldman")
        ? requalify(cfg.base, baseId, "beard", cfg.beard)
        : "none",
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
  if (slot === "beard")
    return n.includes("mustache") || n.includes("moustache")
      ? t("Усы")
      : t("Борода");
  if (slot === "eyewear") return t("Очки");
  if (slot === "earrings") return t("Серьги");
  if (slot === "mask") return t("Маска");
  if (n.includes("beanie")) return t("Шапка");
  if (n.includes("cap")) return t("Кепка");
  if (n.includes("hat")) return t("Шляпа");
  return `${i + 1}`;
}

function PartGrid({
  p,
  slot,
  title,
  render,
  allGroups = true,
}: {
  p: CategoryProps;
  slot: HeadzSlot;
  title: string;
  render?: TileRender;
  allGroups?: boolean;
}) {
  const own = headzBase(p.cfg.base).group;
  const opts = headzOptionsAll(p.cfg.base, slot).filter(
    (o) => allGroups || o.group === own,
  );
  const ids = ["none", ...opts.map((o) => o.qid)];
  const seen = new Map<string, number>();
  const labels: Record<string, string> = { none: t("Нет") };
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
function Chips<T extends string>({
  label,
  options,
  labels,
  value,
  onChange,
}: {
  label: string;
  options: readonly T[];
  labels: Record<T, string>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className={s.chips} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o}
          type="button"
          role="radio"
          aria-checked={o === value}
          className={s.chip}
          onClick={() => onChange(o)}
        >
          {labels[o]}
        </button>
      ))}
    </div>
  );
}

// ── Лицо ──────────────────────────────────────────────────────────────────────

const FACE_SLIDERS: { title: string; items: [FaceShape, string][] }[] = [
  {
    get title() {
      return t("Голова");
    },
    items: [
      ["headWidth", msg("Ширина головы")],
      ["faceLength", msg("Длина лица")],
      ["jaw", msg("Ширина челюсти")],
      ["chin", msg("Подбородок")],
      ["cheeks", msg("Щёки")],
      ["ears", msg("Уши")],
    ],
  },
  {
    get title() {
      return t("Глаза и брови");
    },
    items: [
      ["eyeSize", msg("Размер глаз")],
      ["eyeSpacing", msg("Посадка глаз")],
      ["browHeight", msg("Высота бровей")],
    ],
  },
  {
    get title() {
      return t("Нос и рот");
    },
    items: [
      ["noseSize", msg("Размер носа")],
      ["noseWidth", msg("Ширина носа")],
      ["noseLength", msg("Длина носа")],
      ["lips", msg("Губы")],
      ["mouthWidth", msg("Ширина рта")],
    ],
  },
];

function Face(p: CategoryProps) {
  const cur = headzBase(p.cfg.base);
  const sex = sexOf(cur.group),
    age = ageOf(cur.group);
  // same tone family when switching character, the variant tiles pick the face
  const pick = (g: HeadzGroup) =>
    (
      CATALOG.bases.find((b) => b.group === g && b.tone === cur.tone) ??
      CATALOG.bases.find((b) => b.group === g)
    )?.id;
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
      <Section title={t("Персонаж")}>
        <div className={s.pickRows}>
          <div className={s.inlineRow} style={{ marginTop: 0 }}>
            <span className={s.rangeLabel}>{t("Пол")}</span>
            <Chips
              label={t("Пол")}
              options={["m", "f"] as const}
              labels={{ m: t("Мужской"), f: t("Женский") }}
              value={sex}
              onChange={(v) => go(v, age)}
            />
          </div>
          <div className={s.inlineRow} style={{ marginTop: 0 }}>
            <span className={s.rangeLabel}>{t("Возраст")}</span>
            <Chips
              label={t("Возраст")}
              options={["young", "adult", "old"] as const}
              labels={{
                young: t("Молодой"),
                adult: t("Средний"),
                old: t("Пожилой"),
              }}
              value={age}
              onChange={(v) => go(sex, v)}
            />
          </div>
        </div>
      </Section>
      <Section title={t("Черты лица")}>
        <OptionGrid
          ariaLabel={t("Черты лица")}
          options={variants.map((b) => b.id)}
          labels={Object.fromEntries(
            variants.map((b, i) => [b.id, t(`Вариант {v}`, { v: i + 1 })]),
          )}
          value={cur.id}
          // each variant as sold — its own hair and colours, none of the current parts
          preview={(id) => baseDefault(id)}
          onSelect={(id) => p.set("base", id)}
        />
      </Section>
      <details className={s.advanced}>
        <summary>{t("Точная настройка лица")}</summary>
        {FACE_SLIDERS.map((g) => (
          <Section
            key={g.title}
            title={g.title}
            aside={
              g.items.some(([k]) => p.cfg.face[k]) ? (
                <button
                  type="button"
                  className={s.linkBtn}
                  onClick={() =>
                    p.set(
                      "face",
                      Object.fromEntries(
                        Object.entries(p.cfg.face).filter(
                          ([k]) => !g.items.some(([x]) => x === k),
                        ),
                      ),
                    )
                  }
                >
                  {t("Сбросить")}
                </button>
              ) : undefined
            }
          >
            <div className={s.sliders}>
              {g.items.map(([k, label]) => (
                <SignedSlider
                  key={k}
                  label={t(label)}
                  value={p.cfg.face[k] ?? 0}
                  onChange={(v) => setFace(k, v)}
                />
              ))}
            </div>
          </Section>
        ))}
      </details>
    </>
  );
}

// ── Кожа ──────────────────────────────────────────────────────────────────────

function Skin(p: CategoryProps) {
  const cur = headzBase(p.cfg.base);
  const fx = p.cfg.skinFx;
  const setFx = (k: keyof AvatarConfig["skinFx"], v: number) =>
    p.set("skinFx", { ...fx, [k]: v }, `skinFx:${k}`);
  return (
    <>
      <Section title={t("Тон кожи")}>
        <ColorControl
          label={t("Тон кожи")}
          palette={SKIN_TONES}
          mode="skin"
          sliderLabel={t("Тон кожи: темнее или\u00a0светлее")}
          value={p.cfg.skin ?? nearestTone(cur.skin)}
          onChange={(v, key) =>
            p.set("skin", v, key ? `skin:${key}` : undefined)
          }
        />
      </Section>
      <Section title={t("Детали")}>
        <div className={s.sliders}>
          <RangeField
            label={t("Румянец")}
            value={fx.blush}
            onChange={(v) => setFx("blush", v)}
            min={t("Нет")}
            max={t("Ярко")}
          />
          <RangeField
            label={t("Веснушки")}
            value={fx.freckles}
            onChange={(v) => setFx("freckles", v)}
            min={t("Нет")}
            max={t("Много")}
          />
          <RangeField
            label={t("Морщинки")}
            value={fx.age}
            onChange={(v) => setFx("age", v)}
            min={t("Нет")}
            max={t("Заметные")}
          />
        </div>
        <div className={s.inlineRow}>
          <span className={s.rangeLabel}>{t("Родинки")}</span>
          <Chips
            label={t("Родинки")}
            options={["0", "1", "2", "3"] as const}
            labels={{ 0: t("Нет"), 1: "1", 2: "2", 3: "3" }}
            value={String(fx.moles) as "0"}
            onChange={(v) => setFx("moles", Number(v))}
          />
        </div>
      </Section>
    </>
  );
}

// ── Глаза ─────────────────────────────────────────────────────────────────────

const IRIS_RU: Record<(typeof IRIS_STYLES)[number], string> = {
  get natural() {
    return t("Живые");
  },
  get ring() {
    return t("С ободком");
  },
  get cartoon() {
    return t("Мульт");
  },
  get bright() {
    return t("Лучистые");
  },
};

function Eyes(p: CategoryProps) {
  return (
    <>
      <Section title={t("Цвет глаз")}>
        <ColorControl
          label={t("Цвет глаз")}
          palette={EYE_COLORS}
          allowNone
          noneLabel={t("Как у персонажа")}
          value={p.cfg.eyeColor}
          onChange={(v, key) =>
            p.set("eyeColor", v, key ? `eyeColor:${key}` : undefined)
          }
        />
      </Section>
      <Section title={t("Радужка")}>
        <OptionGrid
          ariaLabel={t("Радужка")}
          options={IRIS_STYLES}
          labels={IRIS_RU}
          value={p.cfg.eyes.style}
          preview={(o) => ({
            ...p.tileCfg,
            eyes: { ...p.tileCfg.eyes, style: o },
          })}
          onSelect={(o) => p.set("eyes", { ...p.cfg.eyes, style: o })}
          render={EYES_ZOOM}
        />
      </Section>
      <Section title={t("Форма")}>
        <div className={s.sliders}>
          <SignedSlider
            label={t("Ресницы")}
            value={p.cfg.eyes.lashes}
            onChange={(v) =>
              p.set("eyes", { ...p.cfg.eyes, lashes: v }, "lashes")
            }
            min={t("Короче")}
            max={t("Длиннее")}
          />
          <SignedSlider
            label={t("Размер глаз")}
            value={p.cfg.face.eyeSize ?? 0}
            onChange={(v) =>
              p.set("face", { ...p.cfg.face, eyeSize: v }, "face:eyeSize")
            }
          />
          <SignedSlider
            label={t("Посадка глаз")}
            value={p.cfg.face.eyeSpacing ?? 0}
            onChange={(v) =>
              p.set("face", { ...p.cfg.face, eyeSpacing: v }, "face:eyeSpacing")
            }
            min={t("Ближе")}
            max={t("Шире")}
          />
        </div>
      </Section>
    </>
  );
}

// ── Брови ─────────────────────────────────────────────────────────────────────

const BROW_RU: Record<(typeof BROW_STYLES)[number], string> = {
  get natural() {
    return t("Как есть");
  },
  get straight() {
    return t("Прямые");
  },
  get arched() {
    return t("Дугой");
  },
  get angled() {
    return t("С изломом");
  },
  get soft() {
    return t("Мягкие");
  },
  get raised() {
    return t("Приподнятые");
  },
};

function Brows(p: CategoryProps) {
  const b = p.cfg.brows;
  return (
    <>
      <Section title={t("Форма бровей")}>
        <OptionGrid
          ariaLabel={t("Форма бровей")}
          options={BROW_STYLES}
          labels={BROW_RU}
          value={b.style}
          preview={(o) => ({
            ...p.tileCfg,
            brows: { ...p.tileCfg.brows, style: o },
          })}
          onSelect={(o) => p.set("brows", { ...b, style: o })}
          render={EYES_ZOOM}
        />
        <div className={s.sliders} style={{ marginTop: 16 }}>
          <SignedSlider
            label={t("Толщина")}
            value={b.thickness}
            onChange={(v) =>
              p.set("brows", { ...b, thickness: v }, "brows:thickness")
            }
            min={t("Тоньше")}
            max={t("Гуще")}
          />
          <SignedSlider
            label={t("Высота")}
            value={p.cfg.face.browHeight ?? 0}
            onChange={(v) =>
              p.set("face", { ...p.cfg.face, browHeight: v }, "face:browHeight")
            }
            min={t("Ниже")}
            max={t("Выше")}
          />
        </div>
      </Section>
      <Section title={t("Цвет бровей")}>
        <ColorControl
          label={t("Цвет бровей")}
          palette={HAIR_COLORS}
          allowNone
          noneLabel={t("Как волосы")}
          value={b.color}
          onChange={(v, key) =>
            p.set("brows", { ...b, color: v }, key ? `brows:${key}` : undefined)
          }
        />
      </Section>
    </>
  );
}

// ── Волосы ────────────────────────────────────────────────────────────────────

function Hair(p: CategoryProps) {
  return (
    <>
      <PartGrid p={p} slot="hair" title={t("Причёска")} render={THREE_Q} />
      <Section title={t("Цвет волос")}>
        <ColorControl
          label={t("Цвет волос")}
          palette={HAIR_COLORS}
          allowNone
          noneLabel={t("Как у персонажа")}
          value={p.cfg.hairColor}
          onChange={(v, key) =>
            p.set("hairColor", v, key ? `hairColor:${key}` : undefined)
          }
        />
      </Section>
      <Section
        title={t("Второй цвет")}
        aside={
          p.cfg.hairTip ? (
            <Chips
              label={t("Как окрасить")}
              options={["tips", "streaks"] as const}
              labels={{ tips: t("Кончики"), streaks: t("Пряди") }}
              value={p.cfg.hairTipStyle}
              onChange={(v) => p.set("hairTipStyle", v)}
            />
          ) : undefined
        }
      >
        <ColorControl
          label={t("Второй цвет волос")}
          palette={HAIR_COLORS}
          allowNone
          noneLabel={t("Без окрашивания")}
          value={p.cfg.hairTip}
          onChange={(v, key) =>
            p.set("hairTip", v, key ? `hairTip:${key}` : undefined)
          }
        />
      </Section>
    </>
  );
}

// ── Борода ────────────────────────────────────────────────────────────────────

function Beard(p: CategoryProps) {
  if (!BEARD_OK.has(headzBase(p.cfg.base).group))
    return (
      <Section title={t("Борода и усы")}>
        <p className={s.note}>{t("Для детских персонажей бороды нет.")}</p>
      </Section>
    );
  return (
    <>
      <PartGrid
        p={p}
        slot="beard"
        title={t("Борода и усы")}
        render={MOUTH_ZOOM}
      />
      {p.cfg.beard !== "none" && (
        <Section title={t("Цвет бороды")}>
          <ColorControl
            label={t("Цвет бороды")}
            palette={HAIR_COLORS}
            allowNone
            noneLabel={t("Как волосы")}
            value={p.cfg.beardColor}
            onChange={(v, key) =>
              p.set("beardColor", v, key ? `beardColor:${key}` : undefined)
            }
          />
        </Section>
      )}
    </>
  );
}

// ── Макияж ────────────────────────────────────────────────────────────────────

function Makeup(p: CategoryProps) {
  const m = p.cfg.makeup;
  const set = (patch: Partial<AvatarConfig["makeup"]>, key?: string) =>
    p.set("makeup", { ...m, ...patch }, key);
  return (
    <>
      <Section title={t("Помада")}>
        <ColorControl
          label={t("Помада")}
          palette={LIP_COLORS}
          allowNone
          noneLabel={t("Без помады")}
          value={m.lip}
          onChange={(v, key) => set({ lip: v }, key ? `lip:${key}` : undefined)}
        />
        {m.lip && (
          <RangeField
            label={t("Насыщенность")}
            value={m.lipAmount}
            onChange={(v) => set({ lipAmount: v }, "lipAmount")}
            min={t("Легко")}
            max={t("Ярко")}
          />
        )}
      </Section>
      <Section title={t("Тени")}>
        <ColorControl
          label={t("Тени")}
          palette={SHADOW_COLORS}
          allowNone
          noneLabel={t("Без теней")}
          value={m.shadow}
          onChange={(v, key) =>
            set({ shadow: v }, key ? `shadow:${key}` : undefined)
          }
        />
        {m.shadow && (
          <RangeField
            label={t("Насыщенность")}
            value={m.shadowAmount}
            onChange={(v) => set({ shadowAmount: v }, "shadowAmount")}
            min={t("Легко")}
            max={t("Ярко")}
          />
        )}
      </Section>
      <Section title={t("Подводка")}>
        <RangeField
          label={t("Подводка")}
          value={m.liner}
          onChange={(v) => set({ liner: v }, "liner")}
          min={t("Нет")}
          max={t("Чётко")}
        />
      </Section>
    </>
  );
}

// ── Аксессуары ────────────────────────────────────────────────────────────────

const PIERCING_RU: Record<(typeof PIERCINGS)[number], string> = {
  get nose() {
    return t("Нос");
  },
  get septum() {
    return t("Септум");
  },
  get lip() {
    return t("Губа");
  },
  get brow() {
    return t("Бровь");
  },
};

function Accessories(p: CategoryProps) {
  const a = p.cfg.acc;
  const setAcc = (patch: Partial<AvatarConfig["acc"]>, key?: string) =>
    p.set("acc", { ...a, ...patch }, key);
  return (
    <>
      <PartGrid p={p} slot="eyewear" title={t("Очки")} allGroups={false} />
      {p.cfg.eyewear !== "none" && (
        <Section title={t("Оправа и стёкла")}>
          <ColorControl
            label={t("Цвет оправы")}
            palette={ACC_COLORS}
            allowNone
            noneLabel={t("Как есть")}
            value={a.frame}
            onChange={(v, key) =>
              setAcc({ frame: v }, key ? `frame:${key}` : undefined)
            }
          />
          <div style={{ marginTop: 14 }} />
          <ColorControl
            label={t("Тон стёкол")}
            palette={[
              "#3A6DF0",
              "#2FB57C",
              "#F2C94C",
              "#E85BA8",
              "#6A4FE8",
              "#1B1B1F",
            ]}
            allowNone
            noneLabel={t("Прозрачные")}
            value={a.lens}
            onChange={(v, key) =>
              setAcc({ lens: v }, key ? `lens:${key}` : undefined)
            }
          />
        </Section>
      )}
      <PartGrid
        p={p}
        slot="headwear"
        title={t("Головной убор")}
        render={THREE_Q}
      />
      {p.cfg.headwear !== "none" && (
        <Section title={t("Цвет головного убора")}>
          <ColorControl
            label={t("Цвет головного убора")}
            palette={ACC_COLORS}
            allowNone
            noneLabel={t("Как есть")}
            value={a.hat}
            onChange={(v, key) =>
              setAcc({ hat: v }, key ? `hat:${key}` : undefined)
            }
          />
        </Section>
      )}
      <PartGrid p={p} slot="earrings" title={t("Серьги")} render={THREE_Q} />
      <Section title={t("Пирсинг")}>
        <div className={s.chips} role="group" aria-label={t("Пирсинг")}>
          {PIERCINGS.map((k) => {
            const on = a.piercings.includes(k);
            return (
              <button
                key={k}
                type="button"
                aria-pressed={on}
                className={s.chip}
                onClick={() =>
                  setAcc({
                    piercings: on
                      ? a.piercings.filter((x) => x !== k)
                      : PIERCINGS.filter(
                          (x) => x === k || a.piercings.includes(x),
                        ),
                  })
                }
              >
                {PIERCING_RU[k]}
              </button>
            );
          })}
        </div>
      </Section>
      <PartGrid p={p} slot="mask" title={t("Маска")} render={MOUTH_ZOOM} />
    </>
  );
}

export const CATEGORIES: {
  id: string;
  label: string;
  Panel: (p: CategoryProps) => JSX.Element;
}[] = [
  {
    id: "face",
    get label() {
      return t("Лицо");
    },
    Panel: Face,
  },
  {
    id: "skin",
    get label() {
      return t("Кожа");
    },
    Panel: Skin,
  },
  {
    id: "eyes",
    get label() {
      return t("Глаза");
    },
    Panel: Eyes,
  },
  {
    id: "brows",
    get label() {
      return t("Брови");
    },
    Panel: Brows,
  },
  {
    id: "hair",
    get label() {
      return t("Волосы");
    },
    Panel: Hair,
  },
  {
    id: "beard",
    get label() {
      return t("Борода");
    },
    Panel: Beard,
  },
  {
    id: "makeup",
    get label() {
      return t("Макияж");
    },
    Panel: Makeup,
  },
  {
    id: "accessories",
    get label() {
      return t("Аксессуары");
    },
    Panel: Accessories,
  },
];
