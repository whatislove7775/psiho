import type { ReactNode } from "react";
import * as Scenes from "./scenes";
import s from "./illustrations.module.css";

export type EmptyScene =
  | "moon"
  | "calendar"
  | "chats"
  | "search"
  | "cozy"
  | "plane"
  | "heart"
  | "sparkles"
  | "shield"
  | "mirror"
  | "breathing"
  | "listening"
  | "lost"
  | "together"
  | "specialist";

const MAP: Record<EmptyScene, (p: { className?: string }) => JSX.Element> = {
  moon: Scenes.SleepingMoon,
  calendar: Scenes.CalendarSparkle,
  chats: Scenes.ChatBubbles,
  search: (p) => <Scenes.MagnifierFind {...p} empty />,
  cozy: Scenes.CozyCorner,
  plane: Scenes.PaperPlane,
  heart: Scenes.HeartHands,
  sparkles: Scenes.SparkleSet,
  shield: Scenes.ShieldFriend,
  mirror: Scenes.MirrorAvatar,
  breathing: Scenes.Breathing,
  listening: Scenes.Listening,
  lost: Scenes.LostBubble,
  together: Scenes.Together,
  specialist: Scenes.SpecialistFriend,
};

/** Just the picture for an empty state (use with the ui EmptyState `art` prop). */
export function EmptyArt({ scene, className }: { scene: EmptyScene; className?: string }) {
  const Art = MAP[scene];
  return <Art className={className} />;
}

/** Playful empty state: an illustration, a title, a line of text and an optional action. */
export function IllustratedEmpty({
  scene,
  title,
  text,
  action,
  size = "md",
}: {
  scene: EmptyScene;
  title: ReactNode;
  text?: ReactNode;
  action?: ReactNode;
  size?: "sm" | "md";
}) {
  return (
    <div className={s.empty} data-size={size}>
      <div className={s.emptyArt}>
        <EmptyArt scene={scene} />
      </div>
      <div className={s.emptyTitle}>{title}</div>
      {text && <p className={s.emptyText}>{text}</p>}
      {action && <div className={s.emptyAction}>{action}</div>}
    </div>
  );
}

/** Compact empty line for small cards: a little picture beside one sentence. */
export function InlineEmpty({ scene, children }: { scene: EmptyScene; children: ReactNode }) {
  return (
    <div className={s.inline}>
      <div className={s.inlineArt}>
        <EmptyArt scene={scene} />
      </div>
      <div className={s.inlineText}>{children}</div>
    </div>
  );
}
