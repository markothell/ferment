// "Rising" (design/ferment/logo): two overlapping arcs, two circles of people
// making an "m", with three saffron thoughts rising. Ink follows the theme;
// never the live green.
export function RisingMark({ size = 24 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden className="shrink-0">
      <path d="M8,52 A15,15 0 0 1 38,52" fill="none" stroke="currentColor" strokeWidth={5} strokeLinecap="round" />
      <path d="M26,52 A15,15 0 0 1 56,52" fill="none" stroke="currentColor" strokeWidth={5} strokeLinecap="round" />
      <circle cx={32} cy={26} r={4.6} style={{ fill: "var(--shared)" }} />
      <circle cx={24} cy={14.5} r={3.3} style={{ fill: "var(--shared)" }} />
      <circle cx={39} cy={7.5} r={3.8} style={{ fill: "var(--shared)" }} />
    </svg>
  );
}
