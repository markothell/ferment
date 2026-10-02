import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  // Each worker migrates its test database once (db/testing.ts); the first
  // test in a file can wait on that while every file starts at once.
  test: { environment: "node", include: ["src/**/*.test.ts"], hookTimeout: 60_000, testTimeout: 30_000 },
});
