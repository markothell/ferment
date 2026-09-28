import { defineConfig } from "drizzle-kit";

// DATABASE_URL set → Postgres (Neon). Unset → the local PGlite store in
// .data/, the same one `npm run dev` opens (src/db/index.ts).
const url = process.env.DATABASE_URL;

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  casing: "snake_case",
  ...(url ? { dbCredentials: { url } } : { driver: "pglite", dbCredentials: { url: "./.data/pglite" } }),
});
