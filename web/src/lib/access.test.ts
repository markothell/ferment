import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DB } from "@/db";
import { communities, invites, user } from "@/db/schema";
import { testDb } from "@/db/testing";
import { maySignIn } from "./access";
import { newId } from "./id";

let db: DB;
const now = new Date("2026-10-01T12:00:00Z");

async function invite(email: string, patch: Partial<typeof invites.$inferInsert> = {}) {
  await db.insert(invites).values({
    id: newId(), communityId: "c1", email, invitedBy: "u_host", tokenHash: newId(),
    expiresAt: new Date(now.getTime() + 86_400_000), ...patch,
  });
}

beforeEach(async () => {
  db = await testDb();
  await db.insert(user).values({ id: "u_host", name: "Host", email: "host@example.com" });
  await db.insert(communities).values({ id: "c1", slug: "c1", name: "C1", createdBy: "u_host" });
  process.env.FERMENT_HOST_EMAILS = "founder@example.com";
});
afterEach(() => { delete process.env.FERMENT_HOST_EMAILS; });

describe("maySignIn", () => {
  it("lets existing accounts and the host allowlist in, case-insensitively", async () => {
    expect(await maySignIn(db, "Host@Example.com", now)).toBe(true);
    expect(await maySignIn(db, " founder@example.com ", now)).toBe(true);
  });

  it("turns away someone with no account and no invitation", async () => {
    expect(await maySignIn(db, "stranger@example.com", now)).toBe(false);
  });

  it("lets a pending, unexpired invitation in", async () => {
    await invite("new@example.com");
    expect(await maySignIn(db, "new@example.com", now)).toBe(true);
  });

  it("ignores revoked and expired invitations", async () => {
    await invite("gone@example.com", { status: "revoked" });
    await invite("late@example.com", { expiresAt: new Date(now.getTime() - 1) });
    expect(await maySignIn(db, "gone@example.com", now)).toBe(false);
    expect(await maySignIn(db, "late@example.com", now)).toBe(false);
  });
});
