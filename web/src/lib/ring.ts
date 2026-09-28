// Seats on a ring. Seat 0 is at twelve o'clock; the rest go clockwise, evenly.

export interface Seat {
  x: number;
  y: number;
  /** Angle in radians, 0 = three o'clock. */
  a: number;
}

export function seat(i: number, n: number, cx: number, cy: number, r: number): Seat {
  const a = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(n, 1);
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), a };
}

export function seats(n: number, cx: number, cy: number, r: number): Seat[] {
  return Array.from({ length: n }, (_, i) => seat(i, n, cx, cy, r));
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "·";
  if (parts.length === 1) return parts[0].slice(0, 2);
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Round to two places so server and client render identical attribute strings. */
export const r2 = (v: number) => Math.round(v * 100) / 100;
