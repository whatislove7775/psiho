/** aprosop mark: a soft face silhouette with two eyes — anonymous, friendly. */
export function LogoMark({ className, size = 20 }: { className?: string; size?: number }) {
  return (
    <span className={className} aria-hidden>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path
          d="M12 3c4.4 0 7.5 3.3 7.5 8.1 0 5-3.4 9.9-7.5 9.9s-7.5-4.9-7.5-9.9C4.5 6.3 7.6 3 12 3Z"
          fill="currentColor"
          opacity=".22"
        />
        <path
          d="M12 3c4.4 0 7.5 3.3 7.5 8.1 0 5-3.4 9.9-7.5 9.9s-7.5-4.9-7.5-9.9C4.5 6.3 7.6 3 12 3Z"
          stroke="currentColor"
          strokeWidth="1.8"
        />
        <circle cx="9.3" cy="10.8" r="1.35" fill="currentColor" />
        <circle cx="14.7" cy="10.8" r="1.35" fill="currentColor" />
        <path d="M9.6 15.1c1.4 1.1 3.4 1.1 4.8 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </span>
  );
}
