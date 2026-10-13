// The theme picked in account settings. Kept out of the client component so
// server layouts can read the cookie name.
export type Theme = "system" | "light" | "dark";
export const THEME_COOKIE = "ferment-theme";

/** The saved theme, or "system" when nothing (or nothing valid) is saved. */
export function savedTheme(value: string | undefined): Theme {
  return value === "light" || value === "dark" ? value : "system";
}
