"use client";

import { useEffect, useMemo, useState } from "react";
import { normalizeAvatar, randomAvatar, type AvatarConfig } from "@/lib/avatar/schema";

/**
 * Static picture of an avatar (rendered once by a shared offscreen WebGL
 * renderer, cached as a data URL). Use for lists, sidebars, cards.
 * If `config` is null a stable random face is derived from `seed`.
 */
export function AvatarThumb({
  config,
  seed = "anon",
  size = 64,
  framing = "face",
  rounded = true,
  background,
  alt = "",
}: {
  config: AvatarConfig | null | undefined;
  seed?: string | number;
  size?: number;
  framing?: "face" | "portrait";
  rounded?: boolean;
  /** CSS colour behind the head; defaults to the raised surface */
  background?: string;
  alt?: string;
}) {
  const cfg = useMemo(() => (config ? normalizeAvatar(config) : randomAvatar(seed)), [config, seed]);
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    // Engine is loaded lazily — three.js stays out of the first paint bundle.
    import("@/lib/avatar/kit/snapshot")
      .then(({ renderAvatarSnapshot }) => renderAvatarSnapshot(cfg, { size: Math.min(512, Math.round(size * 2)), framing }))
      .then((url) => alive && setSrc(url))
      .catch(() => alive && setSrc(null));
    return () => {
      alive = false;
    };
  }, [cfg, size, framing]);

  return (
    <span
      style={{
        display: "block",
        width: size,
        height: size,
        borderRadius: rounded ? "50%" : 18,
        overflow: "hidden",
        background: background ?? "var(--c-raised)",
        flex: "none",
      }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} width={size} height={size} style={{ width: "100%", height: "100%", objectFit: "cover" }} draggable={false} />
      ) : (
        <span
          aria-hidden
          style={{
            display: "block",
            width: "100%",
            height: "100%",
            background: `radial-gradient(circle at 50% 42%, ${cfg.skin.tone} 0 34%, transparent 35%)`,
            opacity: 0.55,
          }}
        />
      )}
    </span>
  );
}
