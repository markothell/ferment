import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite loads its WASM and data files relative to its own module; bundled,
  // those lookups break. Load it from node_modules as is.
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
