import "server-only";

import { closeSync, mkdirSync, openSync, readFileSync, rmSync, writeSync } from "node:fs";
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
// Only one process may ever open .data/pglite. A second handle writes its own
// checkpoint into pg_control while the first keeps appending to the log over
// it; the store then works until the next unclean stop and never opens again.
// `next dev` imports every dynamic route in a throwaway worker process (to
// find its static paths), so:
// - the store opens on first use, not on import: those workers never use it;
// - a lock file holding the owner's pid stops any second opener with an error.
// The handle is held on globalThis so dev reloads reuse it.

const STORE = "./.data/pglite";
const LOCK = "./.data/pglite.lock";

const g = globalThis as unknown as { __fermentDb?: DB; __fermentDbOpen?: DB };

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** Take .data/pglite.lock for this process, or throw if a live process holds it. */
function lock() {
  for (let tries = 0; tries < 2; tries++) {
    try {
      const fd = openSync(LOCK, "wx");
      writeSync(fd, String(process.pid));
      closeSync(fd);
      return;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      const holder = Number(readFileSync(LOCK, "utf8").trim());
      if (holder === process.pid) return;
      if (holder && alive(holder)) {
        throw new Error(
          `The local store ${STORE} is open in process ${holder}. Only one process may open it: stop the other one (dev server, db:migrate, db:studio or starters:load) first.`,
        );
      }
      rmSync(LOCK, { force: true }); // left by a process that has gone
    }
  }
  throw new Error(`Could not take ${LOCK}.`);
}

function unlock() {
  try {
    if (Number(readFileSync(LOCK, "utf8").trim()) === process.pid) rmSync(LOCK, { force: true });
  } catch {}
}

function open(): DB {
  const url = process.env.DATABASE_URL;
  if (url) {
    return drizzleNeon({ client: new Pool({ connectionString: url }), schema, casing: "snake_case" }) as unknown as DB;
  }
  if (process.env.NEXT_PHASE === "phase-production-build") {
    throw new Error("The local PGlite store is not opened during next build. Set DATABASE_URL to build against Postgres.");
  }
  mkdirSync("./.data", { recursive: true });
  lock();
  const client = new PGlite(STORE);
  // Close on the way out (Ctrl-C, or the dev server stopping its worker), so
  // the next start doesn't depend on crash recovery.
  const close = (signal: NodeJS.Signals) => {
    client
      .close()
      .catch(() => {})
      .finally(() => {
        unlock();
        process.kill(process.pid, signal);
      });
  };
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
  process.once("SIGHUP", close);
  process.once("exit", unlock);
  return drizzlePglite({ client, schema, casing: "snake_case" }) as unknown as DB;
}

/** The database, opened on first use. Importing this module opens nothing. */
export const db: DB = (g.__fermentDb ??= new Proxy({} as DB, {
  get(_target, prop) {
    if (prop === "then") return undefined; // not a promise; don't open just to check
    const real = (g.__fermentDbOpen ??= open());
    const value = Reflect.get(real as object, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
  has(_target, prop) {
    return prop in (g.__fermentDbOpen ??= open());
  },
}));

export { schema };
