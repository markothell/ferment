// Our own starters, as written in web/starters/*.json (STARTERS.md §7): read
// by `npm run starters:load`, and by local dev at start.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function curatedFiles(dir = join(process.cwd(), "starters")): unknown[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")));
}
