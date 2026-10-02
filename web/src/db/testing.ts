// A fresh in-memory Postgres per call, migrated from ./drizzle — the same SQL
// production runs, so constraint tests exercise the real schema. Migrating is
// the slow part, so each test worker migrates once and every call clones that.

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { DB } from "./index";
import * as schema from "./schema";

let template: Promise<PGlite> | null = null;

function migrated(): Promise<PGlite> {
  return (template ??= (async () => {
    const client = new PGlite();
    await migrate(drizzle({ client, schema, casing: "snake_case" }), { migrationsFolder: "./drizzle" });
    return client;
  })());
}

export async function testDb(): Promise<DB> {
  const client = (await (await migrated()).clone()) as PGlite;
  return drizzle({ client, schema, casing: "snake_case" }) as unknown as DB;
}
