"use client";

import { Headset } from "lucide-react";
import { AvatarThumb } from "@/components/avatar/AvatarThumb";
import type { Counterpart } from "@/lib/api/chat";
import { Tisha } from "./Tisha";
import s from "./chat.module.css";

export function ConvAvatar({ who, size = 44, seed }: { who: Counterpart; size?: number; seed?: string }) {
  if (who.type === "ai") {
    return (
      <span className={`${s.avatar} ${s.avatarAi}`} style={{ width: size, height: size }}>
        <Tisha size={Math.round(size * 0.92)} state="idle" />
      </span>
    );
  }
  if (who.type === "support") {
    return (
      <span className={`${s.avatar} ${s.avatarSupport}`} style={{ width: size, height: size }}>
        <Headset size={Math.round(size * 0.45)} strokeWidth={1.8} />
      </span>
    );
  }
  return (
    <span className={s.avatar} style={{ width: size, height: size }}>
      <AvatarThumb config={who.avatar_config} seed={seed ?? who.name} size={size} />
    </span>
  );
}
