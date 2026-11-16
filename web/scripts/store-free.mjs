// Runs before db:migrate, db:studio and starters:load. With no DATABASE_URL
// they use the local store; this stops them if a running process (the dev
// server) holds it: two open handles on .data/pglite damage it.
// src/db/index.ts writes the holder's pid to .data/pglite.lock.

import { readFileSync } from "node:fs";

if (process.env.DATABASE_URL) process.exit(0);

let holder = 0;
try {
  holder = Number(readFileSync(".data/pglite.lock", "utf8").trim());
} catch {}

let alive = false;
if (holder) {
  try {
    process.kill(holder, 0);
    alive = true;
  } catch (e) {
    alive = e.code === "EPERM";
  }
}

if (alive) {
  console.error(`.data/pglite is open in process ${holder} (the dev server). Stop it with Ctrl-C first.`);
  process.exit(1);
}
