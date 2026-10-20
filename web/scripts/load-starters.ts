// npm run starters:load: puts our own starters (web/starters/*.json) in the
// library, adding new ones and bringing changed ones up to date by slug. It
// never touches a starter someone else made. Run it after db:migrate.
//
// DATABASE_URL set → Neon. Unset → the local store in .data/pglite, which
// `npm run dev` also loads at start; stop the dev server first, since PGlite
// allows one open handle.

import { PGlite } from "@electric-sql/pglite";
import { Pool } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import type { DB } from "@/db";
import * as schema from "@/db/schema";
import { loadCurated } from "@/domain/starters";
import { curatedFiles } from "@/lib/curated";

async function main() {
  const url = process.env.DATABASE_URL;
  const pool = url ? new Pool({ connectionString: url }) : null;
  const local = url ? null : new PGlite("./.data/pglite");
  const db = (pool
    ? drizzleNeon({ client: pool, schema, casing: "snake_case" })
    : drizzlePglite({ client: local!, schema, casing: "snake_case" })) as unknown as DB;
  try {
    const { added, updated } = await loadCurated(db, curatedFiles());
    const where = url ? new URL(url).hostname : ".data/pglite";
    console.log(`\n✓ ${where}: ${added.length} added${added.length ? ` (${added.join(", ")})` : ""}, ${updated.length} brought up to date.\n`);
  } finally {
    await pool?.end();
    await local?.close();
  }
}

main().catch((e) => {
  console.error(`\n✗ ${e instanceof Error ? e.message : e}\n`);
  process.exit(1);
});
