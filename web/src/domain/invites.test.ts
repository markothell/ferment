import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { DB } from "@/db";
import { invites, seatRequests, user } from "@/db/schema";
import { testDb } from "@/db/testing";
import { maySignIn } from "@/lib/access";
import { createCircle, isCircleMember, joinCircle, type Circle } from "./circles";
import { createCommunity, type Community } from "./communities";
import {
  acceptInvite, confirmInvite, createInvite, declineInvite, findInvite, invitesWaiting, lapseInvites, mySuggestions, withdrawInvite,
} from "./invites";
import { listNotifications } from "./notifications";
import { askForSeat, declineSeat, lapseSeats, makeRoom, myAsk, toggleSeatSupport, waitingSeats, withdrawSeat } from "./seats";

let db: DB;
let community: Community;
let bread: Circle; // running: host, amy, ben, cal
const t0 = new Date("2026-10-01T12:00:00Z");
const days = (n: number) => new Date(t0.getTime() + n * 86_400_000);

async function person(name: string) {
  const id = `u_${name}`;
  await db.insert(user).values({ id, name, email: `${name}@example.com` });
  return id;
}

async function member(name: string) {
  const id = await person(name);
  const token = (await createInvite(db, { communityId: community.id, invitedBy: "u_host", email: `${name}@example.com`, now: t0 })).token!;
  await acceptInvite(db, { token, userId: id, userEmail: `${name}@example.com`, now: t0 });
  return id;
}

const texts = async (userId: string) => (await listNotifications(db, { userId })).map((n) => n.text);
const seatOf = async (inviteId: string) => (await db.select().from(seatRequests).where(eq(seatRequests.inviteId, inviteId)))[0];

beforeEach(async () => {
  db = await testDb();
  process.env.FERMENT_HOST_EMAILS = "host@example.com";
  await person("host");
  community = await createCommunity(db, { userId: "u_host", userEmail: "host@example.com", name: "Tables" });
  bread = await createCircle(db, { communityId: community.id, userId: "u_host", name: "Bread", now: t0 });
  for (const n of ["amy", "ben", "cal"]) await joinCircle(db, { circleId: bread.id, userId: await member(n), now: t0 });
});

describe("suggesting someone", () => {
  it("waits for a host before anything is sent, then comes from the suggester", async () => {
    const s = await createInvite(db, { communityId: community.id, invitedBy: "u_amy", name: "Ana Reyes", email: "ana@example.com", note: "She bakes.", now: t0 });
    expect(s).toMatchObject({ status: "nominated", token: null });
    expect(await maySignIn(db, "ana@example.com", t0)).toBe(false);
    expect(await texts("u_host")).toContain("amy suggests inviting Ana Reyes.");
    expect((await invitesWaiting(db, community.id, "u_host", t0)).map((i) => [i.name, i.by, i.email])).toEqual([["Ana Reyes", "amy", "ana@example.com"]]);
    expect(await mySuggestions(db, community.id, "u_amy", t0)).toHaveLength(1);

    await expect(confirmInvite(db, { inviteId: s.inviteId, userId: "u_ben", now: t0 })).rejects.toThrow(/host/);
    const { token } = await confirmInvite(db, { inviteId: s.inviteId, userId: "u_host", now: t0 });
    expect(await maySignIn(db, "ana@example.com", t0)).toBe(true);
    expect(await texts("u_amy")).toContain("Your invitation to Ana Reyes went out.");
    expect((await findInvite(db, token, t0))?.inviter.name).toBe("amy");
    await expect(confirmInvite(db, { inviteId: s.inviteId, userId: "u_host", now: t0 })).rejects.toThrow(/decided/);

    const ana = await person("ana");
    await acceptInvite(db, { token, userId: ana, userEmail: "ana@example.com", now: t0 });
    expect(await texts("u_amy")).toContain("ana arrived. You invited them.");
  });

  it("needs a name, and one suggestion per person", async () => {
    await expect(createInvite(db, { communityId: community.id, invitedBy: "u_amy", email: "ana@example.com", now: t0 })).rejects.toThrow(/who they are/);
    await createInvite(db, { communityId: community.id, invitedBy: "u_amy", name: "Ana", email: "ana@example.com", now: t0 });
    await expect(createInvite(db, { communityId: community.id, invitedBy: "u_ben", name: "Ana", email: "ANA@example.com", now: t0 }))
      .rejects.toThrow(/amy already suggested them/);
  });

  it("says not now with the host's note, and only the suggester withdraws", async () => {
    const a = await createInvite(db, { communityId: community.id, invitedBy: "u_amy", name: "Ana", email: "ana@example.com", now: t0 });
    await declineInvite(db, { inviteId: a.inviteId, userId: "u_host", note: "Let's wait until spring.", now: t0 });
    expect(await texts("u_amy")).toContain("Not this time for Ana: “Let's wait until spring.”");

    const b = await createInvite(db, { communityId: community.id, invitedBy: "u_amy", name: "Bo", email: "bo@example.com", now: t0 });
    await expect(withdrawInvite(db, { inviteId: b.inviteId, userId: "u_ben" })).rejects.toThrow(/Only/);
    await withdrawInvite(db, { inviteId: b.inviteId, userId: "u_amy" });
    expect(await invitesWaiting(db, community.id, "u_host", t0)).toEqual([]);
  });

  it("lapses after 14 days and tells the suggester", async () => {
    const a = await createInvite(db, { communityId: community.id, invitedBy: "u_amy", name: "Ana", email: "ana@example.com", now: t0 });
    expect(await lapseInvites(db, days(13))).toBe(0);
    expect(await lapseInvites(db, days(14))).toBe(1);
    expect((await db.select().from(invites).where(eq(invites.id, a.inviteId)))[0].status).toBe("lapsed");
    expect(await texts("u_amy")).toContain("Your suggestion of Ana lapsed after 14 days.");
    await expect(confirmInvite(db, { inviteId: a.inviteId, userId: "u_host", now: days(14) })).rejects.toThrow(/decided/);
  });
});

describe("a newcomer into a running circle", () => {
  it("holds the seat once the circle makes room, and seats them when they arrive", async () => {
    const s = await createInvite(db, { communityId: community.id, invitedBy: "u_amy", name: "Ana", email: "ana@example.com", circleId: bread.id, now: t0 });
    expect(await seatOf(s.inviteId)).toMatchObject({ status: "waiting" });
    const [card] = await waitingSeats(db, bread, "u_ben");
    expect(card).toMatchObject({ name: "Ana", newcomer: true, supports: 1, needed: 2, asker: "amy" });
    expect(await texts("u_ben")).toContain("amy suggests Ana for Bread.");

    await toggleSeatSupport(db, { requestId: card.id, userId: "u_ben", now: t0 });
    expect(await seatOf(s.inviteId)).toMatchObject({ status: "admitted" });

    const { token } = await confirmInvite(db, { inviteId: s.inviteId, userId: "u_host", now: t0 });
    expect((await findInvite(db, token, t0))?.circle?.name).toBe("Bread");
    const ana = await person("ana");
    const r = await acceptInvite(db, { token, userId: ana, userEmail: "ana@example.com", now: t0 });
    expect(r).toMatchObject({ joinedCircle: true, circleSlug: "bread" });
    expect(await isCircleMember(db, bread.id, ana)).toBe(true);
    expect(await texts("u_ben")).toContain("ana joined Bread.");
  });

  it("names no circle until it's agreed, and keeps deciding after they arrive", async () => {
    const s = await createInvite(db, { communityId: community.id, invitedBy: "u_amy", name: "Ana", email: "ana@example.com", circleId: bread.id, now: t0 });
    const { token } = await confirmInvite(db, { inviteId: s.inviteId, userId: "u_host", now: t0 });
    expect((await findInvite(db, token, t0))?.circle).toBeNull();
    const ana = await person("ana");
    expect(await acceptInvite(db, { token, userId: ana, userEmail: "ana@example.com", now: t0 })).toMatchObject({ joinedCircle: false });
    const ask = (await myAsk(db, bread.id, ana))!;
    expect(ask).toBeTruthy();

    await toggleSeatSupport(db, { requestId: ask.id, userId: "u_cal", now: t0 });
    expect(await isCircleMember(db, bread.id, ana)).toBe(true);
    expect(await texts(ana)).toContain("You're in Bread.");
  });

  it("goes with the invitation when a host says not now", async () => {
    const s = await createInvite(db, { communityId: community.id, invitedBy: "u_amy", name: "Ana", email: "ana@example.com", circleId: bread.id, now: t0 });
    await declineInvite(db, { inviteId: s.inviteId, userId: "u_host", now: t0 });
    expect(await seatOf(s.inviteId)).toMatchObject({ status: "withdrawn" });
    expect(await waitingSeats(db, bread, "u_ben")).toEqual([]);
  });
});

describe("asking to join a running circle", () => {
  it("is no longer a single tap", async () => {
    const dee = await member("dee");
    await expect(joinCircle(db, { circleId: bread.id, userId: dee, now: t0 })).rejects.toThrow(/Ask to join/);
  });

  it("needs the circle's support; your own ask doesn't count", async () => {
    const dee = await member("dee");
    const req = await askForSeat(db, { circleId: bread.id, userId: dee, note: "Could I sit in?", now: t0 });
    expect(req.status).toBe("waiting");
    expect(await texts("u_amy")).toContain("dee asks to join Bread.");
    await expect(askForSeat(db, { circleId: bread.id, userId: dee, now: t0 })).rejects.toThrow(/already asked/);
    await expect(toggleSeatSupport(db, { requestId: req.id, userId: dee, now: t0 })).rejects.toThrow(/members/);

    expect(await toggleSeatSupport(db, { requestId: req.id, userId: "u_amy", now: t0 })).toBe(true);
    expect(await isCircleMember(db, bread.id, dee)).toBe(false);
    await toggleSeatSupport(db, { requestId: req.id, userId: "u_ben", now: t0 });
    expect(await isCircleMember(db, bread.id, dee)).toBe(true);
    expect(await texts(dee)).toContain("You're in Bread.");
    expect(await texts("u_cal")).toContain("dee joined Bread.");
  });

  it("lets a member suggest someone already here, with their support counted", async () => {
    const dee = await member("dee");
    const req = await askForSeat(db, { circleId: bread.id, userId: "u_amy", forUserId: dee, now: t0 });
    expect(await texts("u_ben")).toContain("amy suggests dee for Bread.");
    await toggleSeatSupport(db, { requestId: req.id, userId: "u_ben", now: t0 });
    expect(await isCircleMember(db, bread.id, dee)).toBe(true);
  });

  it("lets the host make room or say not now", async () => {
    const [dee, eve] = [await member("dee"), await member("eve")];
    const a = await askForSeat(db, { circleId: bread.id, userId: dee, now: t0 });
    await expect(makeRoom(db, { requestId: a.id, userId: "u_amy", now: t0 })).rejects.toThrow(/host/);
    await makeRoom(db, { requestId: a.id, userId: "u_host", now: t0 });
    expect(await isCircleMember(db, bread.id, dee)).toBe(true);

    const b = await askForSeat(db, { circleId: bread.id, userId: eve, now: t0 });
    await declineSeat(db, { requestId: b.id, userId: "u_host", now: t0 });
    expect(await texts(eve)).toContain("Bread couldn't make room this time.");
  });

  it("withdraws, lapses, and leaves forming circles to I'm in", async () => {
    const dee = await member("dee");
    const a = await askForSeat(db, { circleId: bread.id, userId: dee, now: t0 });
    await withdrawSeat(db, { requestId: a.id, userId: dee });
    expect(await myAsk(db, bread.id, dee)).toBeNull();

    await askForSeat(db, { circleId: bread.id, userId: dee, now: t0 });
    expect(await lapseSeats(db, days(14))).toBe(1);
    expect(await texts(dee)).toContain("Your ask to join Bread lapsed after 14 days.");

    const forming = await createCircle(db, { communityId: community.id, userId: "u_host", name: "Kiln", now: t0 });
    await expect(askForSeat(db, { circleId: forming.id, userId: dee, now: t0 })).rejects.toThrow(/I'm in/);
  });
});
