import { randomBytes } from "node:crypto";

// Short, URL-safe, unguessable ids for Ferment's own rows (Better Auth mints
// its own). 16 chars of base32 ≈ 80 bits.
const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

export function newId(): string {
  const bytes = randomBytes(16);
  let out = "";
  for (const b of bytes) out += ALPHABET[b & 31];
  return out;
}
