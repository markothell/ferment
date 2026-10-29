import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { DB } from "@/db";
import { groups, members, user } from "@/db/schema";
import { testDb } from "@/db/testing";
import { createCircle, createLoneCircle } from "./circles";
import { Refusal } from "./errors";
import { createGathering, membershipOf, type Gathering } from "./gatherings";
import { findJoinLink, joinByLink, joinLinkOf, makeJoinLink, setJoinLinkOpen } from "./joinLinks";
import { listNotifications } from "./notifications";

let db: DB;
let gathering: Gathering;
const t0 = new Date("2026-10-28T12:00:00Z");

async function person(name: string) {
  const id = `u_${name}`;
  await db.insert(user).values({ id, name, email: `${name}@example.com` });
  return id;
}

beforeEach(async () => {
  db = await testDb();
  await person("host");
  gathering = await createGathering(db, { userId: "u_host", name: "Tables" });
});

describe("anyone with the link", () => {
  it("is off until a host makes it, and only a host may", async () => {
    expect(await joinLinkOf(db, gathering.id)).toBeNull();
    const amy = await person("amy");
    await db.insert(members).values({ groupId: gathering.id, userId: amy, joinedAt: t0 });
    await expect(makeJoinLink(db, { gatheringId: gathering.id, userId: amy })).rejects.toThrow(/host/);
    await expect(setJoinLinkOpen(db, { gatheringId: gathering.id, userId: "u_host", open: false })).rejects.toThrow(/no link/);

    const token = await makeJoinLink(db, { gatheringId: gathering.id, userId: "u_host" });
    expect(await joinLinkOf(db, gathering.id)).toEqual({ token, open: true, arrivals: 0 });
    expect(await findJoinLink(db, token)).toMatchObject({ open: true, group: { slug: gathering.slug, kind: "gathering" }, host: { email: "host@example.com" } });
    expect(await findJoinLink(db, "nope")).toBeNull();
    expect(await findJoinLink(db, "")).toBeNull();
  });

  it("lets whoever holds it straight in, records how they came, and tells the hosts", async () => {
    const token = await makeJoinLink(db, { gatheringId: gathering.id, userId: "u_host" });
    const ben = await person("ben");
    expect(await joinByLink(db, { token, userId: ben, now: t0 })).toEqual({ slug: gathering.slug, already: false });
    const m = await membershipOf(db, gathering.id, ben);
    expect(m).toMatchObject({ role: "member", viaLink: true, invitedBy: null });
    expect((await listNotifications(db, { userId: "u_host" })).map((n) => n.text)).toContain("ben came in by the link.");
    expect((await joinLinkOf(db, gathering.id))!.arrivals).toBe(1);
    // Again is just going through.
    expect(await joinByLink(db, { token, userId: ben, now: t0 })).toEqual({ slug: gathering.slug, already: true });
    expect((await joinLinkOf(db, gathering.id))!.arrivals).toBe(1);
  });

  it("pauses and opens again, and a new link replaces the old", async () => {
    const token = await makeJoinLink(db, { gatheringId: gathering.id, userId: "u_host" });
    await setJoinLinkOpen(db, { gatheringId: gathering.id, userId: "u_host", open: false });
    expect((await findJoinLink(db, token))?.open).toBe(false);
    const cal = await person("cal");
    await expect(joinByLink(db, { token, userId: cal, now: t0 })).rejects.toThrow(/paused/);
    await setJoinLinkOpen(db, { gatheringId: gathering.id, userId: "u_host", open: true });
    await joinByLink(db, { token, userId: cal, now: t0 });

    const fresh = await makeJoinLink(db, { gatheringId: gathering.id, userId: "u_host" });
    expect(fresh).not.toBe(token);
    expect(await findJoinLink(db, token)).toBeNull();
    const dev = await person("dev");
    await expect(joinByLink(db, { token, userId: dev, now: t0 })).rejects.toThrow(/valid/);
    await joinByLink(db, { token: fresh, userId: dev, now: t0 });
    // Cal stayed in.
    expect(await membershipOf(db, gathering.id, cal)).not.toBeNull();
  });

  it("still counts room", async () => {
    const token = await makeJoinLink(db, { gatheringId: gathering.id, userId: "u_host" });
    await db.update(groups).set({ maxMembers: 2 }).where(eq(groups.id, gathering.id));
    await joinByLink(db, { token, userId: await person("amy"), now: t0 });
    await expect(joinByLink(db, { token, userId: await person("ben"), now: t0 })).rejects.toThrow(/full/);
  });

  it("seats people in a circle on its own, forming it at four; a circle inside a gathering has none", async () => {
    const soup = await createLoneCircle(db, { userId: "u_host", name: "Soup", firstQuestion: "What soup?", now: t0 });
    const token = await makeJoinLink(db, { gatheringId: soup.id, userId: "u_host" });
    for (const n of ["amy", "ben"]) await joinByLink(db, { token, userId: await person(n), now: t0 });
    expect((await db.select().from(groups).where(eq(groups.id, soup.id)))[0].status).toBe("forming");
    await joinByLink(db, { token, userId: await person("cal"), now: t0 });
    expect((await db.select().from(groups).where(eq(groups.id, soup.id)))[0].status).toBe("active");
    const [cal] = await db.select().from(members).where(and(eq(members.groupId, soup.id), eq(members.userId, "u_cal")));
    expect(cal.viaLink).toBe(true);
    expect((await joinLinkOf(db, soup.id))!.arrivals).toBe(3);

    const inside = await createCircle(db, { gatheringId: gathering.id, userId: "u_host", name: "Bread", now: t0 });
    await expect(makeJoinLink(db, { gatheringId: inside.id, userId: "u_host" })).rejects.toThrow(Refusal);
  });
});
