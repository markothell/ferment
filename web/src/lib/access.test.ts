import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DB } from "@/db";
import { user } from "@/db/schema";
import { testDb } from "@/db/testing";
import {
  LINKS_PER_ADDRESS_PER_HOUR, LINKS_PER_IP_PER_HOUR, LINKS_TO_ADDRESS_PER_HOUR, NEW_ADDRESSES_PER_HOUR, NEW_ADDRESSES_PER_IP_PER_HOUR,
  curators, maySignIn, requesterIp,
} from "./access";

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
    expect(await maySignIn(db, "Host@Example.com", null, now)).toBe(true);
    expect(await maySignIn(db, " founder@example.com ", null, now)).toBe(true);
    expect(await maySignIn(db, "stranger@example.com", null, now)).toBe(true);
  });

  it("caps links to one address in an hour, then lets it ask again", async () => {
    for (let i = 0; i < LINKS_PER_ADDRESS_PER_HOUR; i++) expect(await maySignIn(db, "host@example.com", null, now)).toBe(true);
    expect(await maySignIn(db, "HOST@example.com", null, later(1))).toBe(false);
    expect(await maySignIn(db, "host@example.com", null, later(61))).toBe(true);
  });

  it("caps links to addresses with no account, all together, but never holds back an account", async () => {
    for (let i = 0; i < NEW_ADDRESSES_PER_HOUR; i++) expect(await maySignIn(db, `new${i}@example.com`, null, now)).toBe(true);
    expect(await maySignIn(db, "one-more@example.com", null, now)).toBe(false);
    expect(await maySignIn(db, "host@example.com", null, now)).toBe(true);
    expect(await maySignIn(db, "founder@example.com", null, now)).toBe(true);
  });

  it("caps one asker per address, without locking the owner out from elsewhere", async () => {
    for (let i = 0; i < LINKS_PER_ADDRESS_PER_HOUR; i++) expect(await maySignIn(db, "host@example.com", "6.6.6.6", now)).toBe(true);
    expect(await maySignIn(db, "host@example.com", "6.6.6.6", later(1))).toBe(false);
    expect(await maySignIn(db, "host@example.com", "1.2.3.4", later(1))).toBe(true);
  });

  it("still caps an address asked for from many places, so one inbox can't be flooded", async () => {
    for (let i = 0; i < LINKS_TO_ADDRESS_PER_HOUR; i++) expect(await maySignIn(db, "host@example.com", `10.0.0.${i}`, now)).toBe(true);
    expect(await maySignIn(db, "host@example.com", "1.2.3.4", now)).toBe(false);
  });

  it("caps one asker across addresses, and a refused ask isn't counted against anyone", async () => {
    const n = LINKS_PER_IP_PER_HOUR + 1;
    await db.insert(user).values(Array.from({ length: n }, (_, i) => ({ id: `u_${i}`, name: `U${i}`, email: `u${i}@example.com` })));
    for (let i = 0; i < LINKS_PER_IP_PER_HOUR; i++) expect(await maySignIn(db, `u${i}@example.com`, "6.6.6.6", now)).toBe(true);
    for (let i = 0; i < 10; i++) expect(await maySignIn(db, "host@example.com", "6.6.6.6", now)).toBe(false);
    expect(await maySignIn(db, "host@example.com", "1.2.3.4", now)).toBe(true);
    expect(await maySignIn(db, `u${n - 1}@example.com`, "6.6.6.6", later(61))).toBe(true);
  });

  it("gives one asker only a share of the hour's new accounts", async () => {
    for (let i = 0; i < NEW_ADDRESSES_PER_IP_PER_HOUR; i++) expect(await maySignIn(db, `new${i}@example.com`, "6.6.6.6", now)).toBe(true);
    expect(await maySignIn(db, "one-more@example.com", "6.6.6.6", now)).toBe(false);
    expect(await maySignIn(db, "someone@example.com", "1.2.3.4", now)).toBe(true);
  });

  it("reads curators from the allowlist, case-insensitively", () => {
    expect(curators(" A@example.com , b@example.com,")).toEqual(new Set(["a@example.com", "b@example.com"]));
  });

  it("reads the asker's IP from the first forwarded address", () => {
    expect(requesterIp(new Headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toBe("1.2.3.4");
    expect(requesterIp(new Headers({ "x-real-ip": "5.6.7.8" }))).toBe("5.6.7.8");
    expect(requesterIp(new Headers())).toBeNull();
    expect(requesterIp(null)).toBeNull();
  });
});
