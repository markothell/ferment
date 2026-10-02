// A circle's colour, picked by its host: the header tint, its core on the
// community map, its glyph. Saffron is the default ("shared"); the rest are
// muted so they sit with agar and brine. Never verdigris (live) or beet (mine).
// The values live in app/(app)/circles.css as .tint-<name>.
export const CIRCLE_COLORS = ["saffron", "clay", "moss", "slate", "plum"] as const;
export type CircleColor = (typeof CIRCLE_COLORS)[number];
export const isCircleColor = (v: unknown): v is CircleColor => CIRCLE_COLORS.includes(v as CircleColor);
