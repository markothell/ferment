export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Local dev: bring the embedded store up to the current schema before the
  // first request. Neon is migrated ahead of deploy instead.
  if (!process.env.DATABASE_URL) {
    const { db } = await import("./db");
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    await migrate(db as never, { migrationsFolder: "./drizzle" });
  }

  // Local dev has no cron: run the clock every minute instead (lib/tick.ts).
  if (process.env.NODE_ENV === "development") {
    const { tick } = await import("./lib/tick");
    const g = globalThis as unknown as { __fermentTick?: ReturnType<typeof setInterval> };
    if (!g.__fermentTick) {
      g.__fermentTick = setInterval(() => {
        tick().catch((e) => console.error("[tick]", e instanceof Error ? e.message : e));
      }, 60_000);
      g.__fermentTick.unref?.();
    }
  }
}
