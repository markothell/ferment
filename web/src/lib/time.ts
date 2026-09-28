/** "in 3 days", "2 hours ago" — coarse on purpose. */
export function relative(when: Date, now = new Date()): string {
  const ms = when.getTime() - now.getTime();
  const abs = Math.abs(ms);
  const [n, unit] =
    abs < 3_600_000 ? [Math.max(1, Math.round(abs / 60_000)), "minute"]
    : abs < 86_400_000 ? [Math.round(abs / 3_600_000), "hour"]
    : [Math.round(abs / 86_400_000), "day"];
  const s = `${n} ${unit}${n === 1 ? "" : "s"}`;
  return ms >= 0 ? `in ${s}` : `${s} ago`;
}
