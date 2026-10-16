import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { DB } from "@/db";
import { harvestItems, notifications, prompts, responses, rounds, user } from "@/db/schema";
import { testDb } from "@/db/testing";
import { newId } from "@/lib/id";
import { createCircle, leaveCircle, seatInCircle, type Circle } from "./circles";
import { createCommunity, type Community } from "./communities";
import { Refusal } from "./errors";
import { chooseHarvest, harvestById, harvestForRound, proposeHarvest, tickHarvests, withdrawFromHarvest } from "./harvests";
import { circleHarvests, harvestAudio, harvestsByPrompt, readHarvest } from "./harvests.read";
import { feed } from "./feed";
import { acceptInvite, createInvite } from "./invites";
import { respond } from "./rounds";

let db: DB;
let community: Community;
let circle: Circle;
let roundId: string;
let promptId: string;
const [host, amy, ben, cal, dee] = ["u_host", "u_amy", "u_ben", "u_cal", "u_dee"];
const t0 = new Date("2026-10-05T12:00:00Z");
const days = (n: number) => new Date(t0.getTime() + n * 86_400_000);

async function member(name: string) {
  const id = `u_${name}`;
  await db.insert(user).values({ id, name: name[0].toUpperCase() + name.slice(1), email: `${name}@example.com` });
  const token = (await createInvite(db, { communityId: community.id, invitedBy: host, email: `${name}@example.com`, now: t0 })).token!;
  await acceptInvite(db, { token, userId: id, userEmail: `${name}@example.com`, now: t0 });
  return id;
}

/** A closed story round in Bread that host, amy, ben and cal answered; dee didn't. */
beforeEach(async () => {
  db = await testDb();
  process.env.FERMENT_HOST_EMAILS = "host@example.com";
  await db.insert(user).values({ id: host, name: "Host", email: "host@example.com" });
  community = await createCommunity(db, { userId: host, userEmail: "host@example.com", name: "Tables" });
  circle = await createCircle(db, { communityId: community.id, userId: host, name: "Bread", now: t0 });
  for (const n of ["amy", "ben", "cal", "dee"]) await seatInCircle(db, { circleId: circle.id, userId: await member(n), now: t0 });
  promptId = newId();
  roundId = newId();
  await db.insert(prompts).values({ id: promptId, communityId: community.id, authorId: host, question: "What's a meal you remember?", shape: "story", telling: "text" });
  await db.insert(rounds).values({ id: roundId, promptId, communityId: community.id, circleId: circle.id, authorId: host, phase: "closed", openedAt: t0, closedAt: t0 });
  for (const u of [host, amy, ben, cal]) {
    await db.insert(responses).values({ id: newId(), roundId, userId: u, text: `${u}'s meal`, createdAt: t0, updatedAt: t0 });
  }
});

const items = async (harvestId: string) => (await db.select().from(harvestItems).where(eq(harvestItems.harvestId, harvestId))).map((i) => i.userId).sort();
const kinds = async (userId: string) => (await db.select().from(notifications).where(eq(notifications.userId, userId))).map((n) => n.kind);

describe("proposing", () => {
  it("is for people in the circle, on a closed round, and puts the proposer's answer in", async () => {
    const outsider = await member("eve");
    await expect(proposeHarvest(db, { roundId, userId: outsider, now: t0 })).rejects.toThrow(Refusal);
    await db.update(rounds).set({ phase: "open" }).where(eq(rounds.id, roundId));
    await expect(proposeHarvest(db, { roundId, userId: amy, now: t0 })).rejects.toThrow(/closed/);
    await db.update(rounds).set({ phase: "closed" }).where(eq(rounds.id, roundId));

    const h = await proposeHarvest(db, { roundId, userId: amy, now: t0 });
    expect(h.status).toBe("gathering");
    expect(h.answered).toBe(4);
    expect(h.closesAt).toEqual(days(7));
    expect(await items(h.id)).toEqual([amy]);
    expect(await kinds(ben)).toContain("harvest_proposed");
    expect(await kinds(dee)).not.toContain("harvest_proposed"); // didn't answer
    await expect(proposeHarvest(db, { roundId, userId: ben, now: t0 })).rejects.toThrow(/already/);
  });

  it("lets someone who didn't answer propose, with nothing of theirs in it", async () => {
    const h = await proposeHarvest(db, { roundId, userId: dee, now: t0 });
    expect(await items(h.id)).toEqual([]);
  });
});

describe("consent", () => {
  it("goes up at the third yes and tells the circle, and the community can read it", async () => {
    const h = await proposeHarvest(db, { roundId, userId: amy, now: t0 });
    await chooseHarvest(db, { harvestId: h.id, userId: ben, share: true, now: days(1) });
    expect(await readHarvest(db, community.id, h.id)).toBeNull();
    const up = await chooseHarvest(db, { harvestId: h.id, userId: cal, share: true, now: days(2) });
    expect(up.status).toBe("up");
    expect(await kinds(dee)).toContain("harvest_up");

    const read = (await readHarvest(db, community.id, h.id))!;
    expect(read.shared).toBe(3);
    expect(read.items.map((i) => i.text)).toEqual([`${amy}'s meal`, `${ben}'s meal`, `${cal}'s meal`]);
    expect((await circleHarvests(db, community.id, circle.id)).map((c) => c.id)).toEqual([h.id]);
    expect((await harvestsByPrompt(db, community.id)).get(promptId)?.[0].shared).toBe(3);
  });

  it("shows on its question in the feed without changing how the question ranks", async () => {
    const before = await feed(db, community.id, amy);
    const h = await proposeHarvest(db, { roundId, userId: amy, now: t0 });
    await chooseHarvest(db, { harvestId: h.id, userId: ben, share: true, now: t0 });
    await chooseHarvest(db, { harvestId: h.id, userId: cal, share: true, now: t0 });
    const after = await feed(db, community.id, amy);
    expect(after.map((i) => [i.promptId, i.here])).toEqual(before.map((i) => [i.promptId, i.here]));
    expect(after.find((i) => i.promptId === promptId)!.harvests).toEqual([{ id: h.id, circleName: "Bread", circleColor: "saffron", shared: 3 }]);
  });

  it("copies only the yeses, and someone without an answer can't share", async () => {
    const h = await proposeHarvest(db, { roundId, userId: amy, now: t0 });
    await chooseHarvest(db, { harvestId: h.id, userId: ben, share: false, now: t0 });
    await expect(chooseHarvest(db, { harvestId: h.id, userId: dee, share: true, now: t0 })).rejects.toThrow(/didn't answer/);
    expect(await items(h.id)).toEqual([amy]);
  });

  it("lets a choice change until the week ends, and no later", async () => {
    const h = await proposeHarvest(db, { roundId, userId: amy, now: t0 });
    await chooseHarvest(db, { harvestId: h.id, userId: ben, share: false, now: t0 });
    await chooseHarvest(db, { harvestId: h.id, userId: ben, share: true, now: days(3) });
    expect(await items(h.id)).toEqual([amy, ben]);
    await chooseHarvest(db, { harvestId: h.id, userId: ben, share: false, now: days(4) });
    expect(await items(h.id)).toEqual([amy]);
    await expect(chooseHarvest(db, { harvestId: h.id, userId: cal, share: true, now: days(8) })).rejects.toThrow(/ended/);
  });

  it("shows an edited answer as it is now", async () => {
    const h = await proposeHarvest(db, { roundId, userId: amy, now: t0 });
    await respond(db, { roundId, userId: amy, input: { text: "Soup, actually" }, now: days(1) });
    const [item] = await db.select().from(harvestItems).where(eq(harvestItems.harvestId, h.id));
    expect(item.text).toBe("Soup, actually");
  });
});

describe("taking yours out", () => {
  it("removes only the copy, and below three the harvest comes down", async () => {
    const h = await proposeHarvest(db, { roundId, userId: amy, now: t0 });
    await chooseHarvest(db, { harvestId: h.id, userId: ben, share: true, now: t0 });
    await chooseHarvest(db, { harvestId: h.id, userId: cal, share: true, now: t0 });
    await chooseHarvest(db, { harvestId: h.id, userId: host, share: true, now: t0 });

    await withdrawFromHarvest(db, { harvestId: h.id, userId: cal, now: days(10) });
    expect((await readHarvest(db, community.id, h.id))!.shared).toBe(3);
    expect(await db.select().from(responses).where(eq(responses.userId, cal))).toHaveLength(1);

    const down = await withdrawFromHarvest(db, { harvestId: h.id, userId: ben, now: days(11) });
    expect(down.status).toBe("down");
    expect(await readHarvest(db, community.id, h.id)).toBeNull();
    expect(await kinds(amy)).toContain("harvest_down");
    expect(await kinds(cal)).not.toContain("harvest_down");
    await expect(withdrawFromHarvest(db, { harvestId: h.id, userId: dee, now: days(11) })).rejects.toThrow(Refusal);
  });

  it("stops a voice answer playing once it's out, and never plays one outside the community", async () => {
    await db.update(responses).set({ audioUrl: "/api/audio/local/amy.m4a" }).where(eq(responses.userId, amy));
    const h = await proposeHarvest(db, { roundId, userId: amy, now: t0 });
    for (const u of [ben, cal, host]) await chooseHarvest(db, { harvestId: h.id, userId: u, share: true, now: t0 });
    const item = (await readHarvest(db, community.id, h.id))!.items.find((i) => i.userId === amy)!;
    expect(item.audioUrl).toBe(`/api/listen/h/${h.id}/${amy}`);
    expect(await harvestAudio(db, h.id, amy, dee)).toBe("/api/audio/local/amy.m4a");

    await db.insert(user).values({ id: "u_far", name: "Far", email: "far@example.com" });
    expect(await harvestAudio(db, h.id, amy, "u_far")).toBeNull();

    await withdrawFromHarvest(db, { harvestId: h.id, userId: amy, now: days(2) });
    expect(await harvestAudio(db, h.id, amy, dee)).toBeNull();
  });

  it("works after leaving the circle, and leaving alone takes nothing out", async () => {
    const h = await proposeHarvest(db, { roundId, userId: amy, now: t0 });
    await chooseHarvest(db, { harvestId: h.id, userId: ben, share: true, now: t0 });
    await chooseHarvest(db, { harvestId: h.id, userId: cal, share: true, now: t0 });
    await leaveCircle(db, { circleId: circle.id, userId: cal, now: days(1) });
    expect(await items(h.id)).toEqual([amy, ben, cal].sort());
    await withdrawFromHarvest(db, { harvestId: h.id, userId: cal, now: days(2) });
    expect(await items(h.id)).toEqual([amy, ben].sort());
  });

  it("never shows a harvest whose sharers' accounts are gone", async () => {
    const h = await proposeHarvest(db, { roundId, userId: amy, now: t0 });
    await chooseHarvest(db, { harvestId: h.id, userId: ben, share: true, now: t0 });
    await chooseHarvest(db, { harvestId: h.id, userId: cal, share: true, now: t0 });
    await db.delete(user).where(eq(user.id, cal));
    expect(await readHarvest(db, community.id, h.id)).toBeNull();
  });
});

describe("the clock", () => {
  it("reminds who hasn't chosen, then lapses what never reached three, and it can be proposed again", async () => {
    const h = await proposeHarvest(db, { roundId, userId: amy, now: t0 });
    await chooseHarvest(db, { harvestId: h.id, userId: ben, share: false, now: t0 });
    expect(await tickHarvests(db, days(4))).toEqual({ reminded: 0, lapsed: 0 });
    expect((await tickHarvests(db, days(5.5))).reminded).toBe(2); // host and cal; ben chose
    expect((await tickHarvests(db, days(6))).reminded).toBe(0);
    expect((await tickHarvests(db, days(7))).lapsed).toBe(1);
    expect((await harvestById(db, h.id))!.status).toBe("lapsed");
    expect(await kinds(amy)).toContain("harvest_lapsed");

    const again = await proposeHarvest(db, { roundId, userId: ben, now: days(8) });
    expect(again.status).toBe("gathering");
    expect(await harvestById(db, h.id)).toBeNull();
    const view = (await harvestForRound(db, roundId, cal, days(8)))!;
    expect(view).toMatchObject({ shared: 1, open: true, mineIn: false, myChoice: null, proposer: "Ben" });
  });

  it("leaves a harvest that's up alone when its week ends", async () => {
    const h = await proposeHarvest(db, { roundId, userId: amy, now: t0 });
    await chooseHarvest(db, { harvestId: h.id, userId: ben, share: true, now: t0 });
    await chooseHarvest(db, { harvestId: h.id, userId: cal, share: true, now: t0 });
    await tickHarvests(db, days(8));
    expect((await harvestById(db, h.id))!.status).toBe("up");
  });
});
