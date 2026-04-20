/**
 * أيقونة UP FLOW: خط انسيابي صاعد + سهم بسيط (Minimal / Ascent).
 */
export function UpFlowLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M4 17c2.5-5 5-8 8-8s4 3 4 8"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path
        d="M12 17V7m0 0-3 3m3-3 3 3"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
