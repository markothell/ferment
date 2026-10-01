// The theme switch in the app footer (temporary, while we build). Kept out of
// the client component so the server layout can read the cookie name.
export type Theme = "system" | "light" | "dark";
export const THEME_COOKIE = "ferment-theme";
