import "server-only";

import { mkdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { Pool } from "@neondatabase/serverless";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import * as schema from "./schema";

export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;

// DATABASE_URL set → Neon, migrated ahead of deploy (`npm run db:migrate`).
// Unset → an embedded PGlite store under .data/, migrated at server start by
// src/instrumentation.ts, so a fresh checkout runs with nothing to install.
//
// Held on globalThis so dev reloads reuse one connection: PGlite allows a
// single open handle per data directory.
const g = globalThis as unknown as { __fermentDb?: DB };

function open(): DB {
  const url = process.env.DATABASE_URL;
  if (url) {
    return drizzleNeon({ client: new Pool({ connectionString: url }), schema, casing: "snake_case" }) as unknown as DB;
  }
  mkdirSync("./.data", { recursive: true });
  const client = new PGlite("./.data/pglite");
  // PGlite's files don't survive a hard stop mid-write, so close it on the
  // way out (Ctrl-C, or the dev server restarting its worker).
  const close = (signal: NodeJS.Signals) => {
    client.close().finally(() => process.kill(process.pid, signal));
  };
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
  return drizzlePglite({ client, schema, casing: "snake_case" }) as unknown as DB;
}

export const db: DB = (g.__fermentDb ??= open());

export { schema };
