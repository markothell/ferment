// A fresh in-memory Postgres per call, migrated from ./drizzle — the same SQL
// production runs, so constraint tests exercise the real schema.

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { DB } from "./index";
import * as schema from "./schema";

export async function testDb(): Promise<DB> {
  const db = drizzle({ client: new PGlite(), schema, casing: "snake_case" });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return db as unknown as DB;
}
