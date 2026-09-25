import { useId } from "react";

/**
 * aprosop mark: a speech bubble with a calm, smiling face on the brand-blue tile.
 * "Talk freely, your face stays yours": the bubble is the only face you show.
 * The same drawing lives in /public/favicon.svg (keep them in sync).
 */
export function LogoMark({
  className,
  size = 34,
  title,
}: {
  className?: string;
  size?: number;
  title?: string;
}) {
  // Tiny sizes drop the sparkle and thicken the features so they survive 16px.
  const tiny = size <= 20;
  // Unique gradient id per instance: a shared id breaks when the first copy is display:none
  const gid = `aprosop-logo-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const stroke = tiny ? 3 : 2.4;
  return (
    <span className={className} aria-hidden={title ? undefined : true} style={{ display: "inline-flex", flex: "none" }}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        fill="none"
        role={title ? "img" : undefined}
        aria-label={title}
        style={{ display: "block" }}
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#7AA5FF" />
            <stop offset=".55" stopColor="#3A6DF0" />
            <stop offset="1" stopColor="#6A4FE8" />
          </linearGradient>
        </defs>
        <rect width="48" height="48" rx="14" fill={`url(#${gid})`} />
        <path
          d="M24 9.5c8.8 0 15.5 6 15.5 13.8S32.8 37 24 37c-1.6 0-3.1-.2-4.6-.6l-6.2 4.1c-.8.5-1.7-.3-1.4-1.1l1.8-5.3C10.5 31.8 8.5 27.8 8.5 23.3 8.5 15.5 15.2 9.5 24 9.5Z"
          fill="#fff"
        />
        <circle cx="15.4" cy="26.6" r="2.7" fill="#FFB08A" opacity=".85" />
        <circle cx="32.6" cy="26.6" r="2.7" fill="#FFB08A" opacity=".85" />
        <path
          d="M16.6 21.8c1.2-1.9 3.6-1.9 4.8 0M26.6 21.8c1.2-1.9 3.6-1.9 4.8 0M20.2 27.2c2.2 2.3 5.4 2.3 7.6 0"
          stroke="#1A2350"
          strokeWidth={stroke}
          strokeLinecap="round"
        />
        {!tiny && (
          <path d="M38.5 5.5l1.1 2.9 2.9 1.1-2.9 1.1-1.1 2.9-1.1-2.9-2.9-1.1 2.9-1.1Z" fill="#FFE17C" />
        )}
      </svg>
    </span>
  );
}
