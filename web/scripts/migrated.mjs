// Runs after `drizzle-kit migrate` (npm run db:migrate) and prints what the
// database has applied, against the migrations in drizzle/. drizzle-kit's own
// success line is redrawn away by its spinner, so this is the one that stays.
// Read-only. Exits non-zero if anything in drizzle/ is still unapplied.

import { readFile } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";

const journal = JSON.parse(await readFile(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"));
const url = process.env.DATABASE_URL;

if (!url) {
  console.log(`Local store (.data/pglite): ${journal.entries.length} migrations in drizzle/. Not checked here; the dev server applies them at start.`);
  process.exit(0);
}

const sql = neon(url);
const rows = await sql.query('select created_at from drizzle."__drizzle_migrations"');
const applied = new Set(rows.map((r) => Number(r.created_at)));
const missing = journal.entries.filter((e) => !applied.has(e.when));
const host = new URL(url).hostname;

if (missing.length) {
  console.error(`\n✗ ${host}: ${journal.entries.length - missing.length} of ${journal.entries.length} migrations applied. Not applied: ${missing.map((e) => e.tag).join(", ")}\n`);
  process.exit(1);
}
const last = journal.entries.at(-1);
console.log(`\n✓ ${host}: all ${journal.entries.length} migrations applied, latest ${last.tag}.\n`);
