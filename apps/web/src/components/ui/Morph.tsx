"use client";

/**
 * Morphing stroke icons (npm `morphicons`, spring physics).
 *
 * Usage:
 *   import { Morph, MI } from "@/components/ui/Morph";
 *   <Morph icon={open ? MI.X : MI.Menu} />
 *
 * `icon` takes Lucide *data* (the vanilla `lucide` package, same version as
 * lucide-react) — not lucide-react components. The common icons are re-exported
 * as `MI`; import others from "lucide" directly. The SVG inherits currentColor,
 * is aria-hidden unless `label` is passed, and honours prefers-reduced-motion.
 */
import { forwardRef } from "react";
import { MorphIcon, type IconInput, type MorphHandle, type MorphIconProps } from "morphicons/react";
import {
  ArrowUp,
  Camera,
  CameraOff,
  Check,
  Menu,
  Mic,
  MicOff,
  Moon,
  Pause,
  Play,
  Send,
  Sun,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
  X,
} from "lucide";

/**
 * lucide@0.460 exports icons as ["svg", attrs, children]; morphicons wants the flat
 * children list ([tag, attrs][]). Accepts either shape (and raw `d` strings).
 */
export const asIcon = (node: unknown): IconInput => {
  if (Array.isArray(node) && node[0] === "svg" && Array.isArray(node[2])) return node[2] as unknown as IconInput;
  return node as IconInput;
};

export const MI = {
  ArrowUp: asIcon(ArrowUp),
  Camera: asIcon(Camera),
  CameraOff: asIcon(CameraOff),
  Check: asIcon(Check),
  Menu: asIcon(Menu),
  Mic: asIcon(Mic),
  MicOff: asIcon(MicOff),
  Moon: asIcon(Moon),
  Pause: asIcon(Pause),
  Play: asIcon(Play),
  Send: asIcon(Send),
  Sun: asIcon(Sun),
  Video: asIcon(Video),
  VideoOff: asIcon(VideoOff),
  Volume2: asIcon(Volume2),
  VolumeX: asIcon(VolumeX),
  X: asIcon(X),
};

export type MorphProps = MorphIconProps;
export type { IconInput, MorphHandle };

export const Morph = forwardRef<MorphHandle, MorphProps>(function Morph(
  { size = 20, strokeWidth = 1.8, spring = "snappy", reducedMotion = "user", ...rest },
  ref,
) {
  return <MorphIcon ref={ref} size={size} strokeWidth={strokeWidth} spring={spring} reducedMotion={reducedMotion} {...rest} />;
});
