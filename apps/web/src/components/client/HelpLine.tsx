import s from "./helpLine.module.css";

/**
 * The one quiet crisis line used where it is genuinely needed (booking confirmation,
 * end of a call, Тиша intro). Words are the links; numbers stay out of the way.
 * 8-800-333-44-34: free 24/7 all-Russian crisis line for adults.
 */
export function HelpLine({ className }: { className?: string }) {
  return (
    <p className={className ? `${s.line} ${className}` : s.line}>
      Если очень тяжело прямо сейчас: <a href="tel:88003334434" title="8-800-333-44-34, бесплатно, круглосуточно">телефон доверия</a>{" "}
      или <a href="tel:112" title="112">112</a>.
    </p>
  );
}
