"use client";
import { t } from "@/lib/i18n";
import { AvatarView } from "@/components/avatar/AvatarView";
import { randomAvatar } from "@/lib/avatar/schema";
import type { AvatarRendererApi } from "@/lib/avatar/kit/types";
import s from "./couples.module.css";
const faces = [randomAvatar("couple-b"), randomAvatar("couple-c")];
const still = (r: AvatarRendererApi) => r.setIdle(false);
export function CoupleScene() {
  return (
    <figure
      className={s.scene}
      aria-label={t("Два разных аватара в общей встрече")}
    >
      <span className={s.sceneSpark} aria-hidden>
        ✦
      </span>
      <div className={s.sceneFaces}>
        {faces.map((config, i) => (
          <div key={i} className={s.sceneOrb} aria-hidden="true">
            <AvatarView
              config={config}
              framing="face"
              interactive={false}
              deferLoad
              onReady={still}
              className={s.sceneAvatar}
            />
          </div>
        ))}
      </div>
      <figcaption className={s.sceneCaption}>
        {t("Два аватара. Одна встреча.")}
      </figcaption>
    </figure>
  );
}
