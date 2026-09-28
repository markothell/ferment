export async function register() {
  // Local dev only: bring the embedded store up to the current schema before
  // the first request. Neon is migrated ahead of deploy instead.
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.DATABASE_URL) return;
  const { db } = await import("./db");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  await migrate(db as never, { migrationsFolder: "./drizzle" });
}
