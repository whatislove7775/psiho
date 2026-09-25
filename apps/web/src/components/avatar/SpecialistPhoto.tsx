"use client";

import { useEffect, useState } from "react";

const TINTS = ["var(--p-sky)", "var(--p-lilac)", "var(--p-mint)", "var(--p-peach)", "var(--p-butter)", "var(--p-lime)"];

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const s = (parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "");
  return s.toUpperCase() || "?";
}

function tintFor(key: string) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return TINTS[Math.abs(h) % TINTS.length];
}

/**
 * Real photo of a specialist (specialists are not anonymous — clients see
 * their face). Falls back to initials on a pastel circle while there is no
 * photo or it fails to load.
 */
export function SpecialistPhoto({
  url,
  name,
  size = 64,
  rounded = true,
  alt,
}: {
  url: string | null | undefined;
  name: string;
  size?: number;
  rounded?: boolean;
  alt?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  const show = !!url && !failed;
  return (
    <span
      style={{
        display: "grid",
        placeItems: "center",
        width: size,
        height: size,
        borderRadius: rounded ? "50%" : Math.round(size * 0.22),
        overflow: "hidden",
        flex: "none",
        background: show ? "var(--c-raised)" : tintFor(name),
        color: "#111",
        fontWeight: 650,
        fontSize: Math.max(11, Math.round(size * 0.36)),
        letterSpacing: "-0.02em",
        userSelect: "none",
      }}
      role={show ? undefined : "img"}
      aria-label={show ? undefined : alt ?? name}
    >
      {show ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url!}
          alt={alt ?? name}
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailed(true)}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      ) : (
        <span aria-hidden>{initials(name)}</span>
      )}
    </span>
  );
}
