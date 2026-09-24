/**
 * AvatarConfig → identity morph weights of the sculpted kit head
 * (see tools/avatar-kit/build.py IDENTITY). Categorical studio options are
 * presets over a handful of continuous morphs, like Apple's sliders.
 */
import type { AvatarConfig } from "../schema";

type W = Record<string, number>;

const add = (w: W, k: string, v: number) => (w[k] = Math.min(1, (w[k] ?? 0) + v));

export function identityWeights(cfg: AvatarConfig): W {
  const w: W = {};
  switch (cfg.head.shape) {
    case "round": add(w, "idHeadWide", 0.3); add(w, "idFaceShort", 0.5); add(w, "idChinRound", 0.5); break;
    case "oval": add(w, "idFaceLong", 0.25); add(w, "idJawNarrow", 0.3); break;
    case "square": add(w, "idChinSquare", 0.8); add(w, "idJawWide", 0.6); break;
    case "heart": add(w, "idJawNarrow", 0.9); add(w, "idChinPointed", 0.5); add(w, "idHeadWide", 0.3); break;
    case "long": add(w, "idFaceLong", 1); add(w, "idHeadNarrow", 0.4); break;
    case "wide": add(w, "idHeadWide", 1); add(w, "idJawWide", 0.6); break;
  }
  switch (cfg.head.chin) {
    case "soft": add(w, "idChinRound", 0.4); break;
    case "pointed": add(w, "idChinPointed", 0.9); break;
    case "square": add(w, "idChinSquare", 0.9); break;
    case "cleft": add(w, "idChinSquare", 0.4); break;
  }
  const c = cfg.head.cheeks;
  if (c > 0.5) add(w, "idCheeksFull", (c - 0.5) * 2);
  else add(w, "idCheeksThin", (0.5 - c) * 2);

  switch (cfg.nose.shape) {
    case "button": add(w, "idNoseUp", 0.8); add(w, "idNoseSmall", 0.4); break;
    case "straight": add(w, "idNoseBridge", 0.8); add(w, "idNoseNarrow", 0.3); break;
    case "wide": add(w, "idNoseWide", 1); break;
    case "pointed": add(w, "idNoseNarrow", 0.8); add(w, "idNoseBridge", 0.6); add(w, "idNoseDown", 0.3); break;
    case "round": add(w, "idNoseBig", 0.4); add(w, "idNoseWide", 0.4); break;
    case "long": add(w, "idNoseDown", 0.8); add(w, "idNoseBridge", 0.5); break;
    case "hooked": add(w, "idNoseHook", 1); add(w, "idNoseDown", 0.5); break;
  }
  const ns = cfg.nose.size;
  if (ns > 0.5) add(w, "idNoseBig", (ns - 0.5) * 2);
  else add(w, "idNoseSmall", (0.5 - ns) * 2);

  switch (cfg.mouth.shape) {
    case "full": add(w, "idLipUpperFull", 0.7); add(w, "idLipLowerFull", 0.7); break;
    case "thin": add(w, "idLipUpperThin", 1); add(w, "idLipLowerThin", 1); break;
    case "wide": add(w, "idMouthWide", 1); break;
    case "heart": add(w, "idLipUpperFull", 1); add(w, "idMouthNarrow", 0.3); break;
    case "small": add(w, "idMouthNarrow", 1); break;
    case "bow": add(w, "idLipUpperFull", 0.6); add(w, "idLipLowerThin", 0.3); break;
  }
  if (cfg.ears.size === "small") add(w, "idEarsSmall", 1);
  if (cfg.ears.size === "large") add(w, "idEarsBig", 1);
  const es = cfg.eyes.size;
  if (es > 0.5) add(w, "idEyesBig", (es - 0.5) * 2);
  else add(w, "idEyesSmall", (0.5 - es) * 2);
  return w;
}
