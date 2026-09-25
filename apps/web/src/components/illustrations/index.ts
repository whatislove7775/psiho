/** aprosop illustration library. See kit.tsx for the style notes. */
export * from "./scenes";
export { Spot, type SpotName } from "./spots";
export { TopicArt, type TopicKey } from "./topics";
export { EmptyArt, IllustratedEmpty, InlineEmpty, type EmptyScene } from "./Empty";
export { LogoFace } from "./kit";

import sizes from "./illustrations.module.css";
/** Class names for common illustration sizes: `<ShieldFriend className={illSize.md} />`. */
export const illSize = { xs: sizes.sizeXs, sm: sizes.sizeSm, md: sizes.sizeMd, lg: sizes.sizeLg };
