import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DB } from "@/db";
import { user } from "@/db/schema";
import { testDb } from "@/db/testing";
import { LINKS_PER_ADDRESS_PER_HOUR, NEW_ADDRESSES_PER_HOUR, curators, maySignIn } from "./access";

let db: DB;
const now = new Date("2026-10-01T12:00:00Z");
const later = (minutes: number) => new Date(now.getTime() + minutes * 60_000);

beforeEach(async () => {
  db = await testDb();
  await db.insert(user).values({ id: "u_host", name: "Host", email: "host@example.com" });
  process.env.FERMENT_HOST_EMAILS = "founder@example.com";
});
afterEach(() => { delete process.env.FERMENT_HOST_EMAILS; });

describe("maySignIn", () => {
  it("lets anyone ask for a link: an account, a curator, or someone new", async () => {
    expect(await maySignIn(db, "Host@Example.com", now)).toBe(true);
    expect(await maySignIn(db, " founder@example.com ", now)).toBe(true);
    expect(await maySignIn(db, "stranger@example.com", now)).toBe(true);
  });

  it("caps links to one address in an hour, then lets it ask again", async () => {
    for (let i = 0; i < LINKS_PER_ADDRESS_PER_HOUR; i++) expect(await maySignIn(db, "host@example.com", now)).toBe(true);
    expect(await maySignIn(db, "HOST@example.com", later(1))).toBe(false);
    expect(await maySignIn(db, "host@example.com", later(61))).toBe(true);
  });

  it("caps links to addresses with no account, all together, but never holds back an account", async () => {
    for (let i = 0; i < NEW_ADDRESSES_PER_HOUR; i++) expect(await maySignIn(db, `new${i}@example.com`, now)).toBe(true);
    expect(await maySignIn(db, "one-more@example.com", now)).toBe(false);
    expect(await maySignIn(db, "host@example.com", now)).toBe(true);
    expect(await maySignIn(db, "founder@example.com", now)).toBe(true);
  });

  it("reads curators from the allowlist, case-insensitively", () => {
    expect(curators(" A@example.com , b@example.com,")).toEqual(new Set(["a@example.com", "b@example.com"]));
  });
});
