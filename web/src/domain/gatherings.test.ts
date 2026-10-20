import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { DB } from "@/db";
import { circles, invites, prompts, responses, rounds, user } from "@/db/schema";
import { testDb } from "@/db/testing";
import { newId } from "@/lib/id";
import { CIRCLE_MAX, createCircle, expireProposals, joinCircle, leaveCircle, seatInCircle, setCircleColor } from "./circles";
import { gatheringHome, createGathering, setWelcomeQuestion, type Gathering } from "./gatherings";
import { Refusal } from "./errors";
import { acceptInvite, createInvite, findInvite } from "./invites";

let db: DB;
let gathering: Gathering;
const t0 = new Date("2026-10-01T12:00:00Z");
const days = (n: number) => new Date(t0.getTime() + n * 86_400_000);

async function person(name: string) {
  const id = `u_${name}`;
  await db.insert(user).values({ id, name, email: `${name}@example.com` });
  return id;
}

/** Invite and accept in one go: a new member of the gathering. */
async function member(name: string, circleId: string | null = null) {
  const id = await person(name);
  const token = (await createInvite(db, { gatheringId: gathering.id, invitedBy: "u_host", email: `${name}@example.com`, circleId, now: t0 })).token!;
  await acceptInvite(db, { token, userId: id, userEmail: `${name}@example.com`, now: t0 });
  return id;
}

beforeEach(async () => {
  db = await testDb();
  process.env.FERMENT_HOST_EMAILS = "host@example.com";
  await person("host");
  gathering = await createGathering(db, { userId: "u_host", userEmail: "host@example.com", name: "Tuesday Tables" });
});

describe("gatherings", () => {
  it("only lets the host allowlist start one, and gives each a unique slug", async () => {
    await person("amy");
    await expect(createGathering(db, { userId: "u_amy", userEmail: "amy@example.com", name: "Mine" })).rejects.toBeInstanceOf(Refusal);
    const again = await createGathering(db, { userId: "u_host", userEmail: "host@example.com", name: "Tuesday Tables" });
    expect(gathering.slug).toBe("tuesday-tables");
    expect(again.slug).toBe("tuesday-tables-2");
  });

  it("rewords the welcome question until someone answers, then replaces it", async () => {
    await setWelcomeQuestion(db, { gatheringId: gathering.id, userId: "u_host", question: "What brought you?" });
    await setWelcomeQuestion(db, { gatheringId: gathering.id, userId: "u_host", question: "What brought you here?" });
    let all = await db.select().from(rounds);
    expect(all).toHaveLength(1);

    await db.insert(responses).values({ id: newId(), roundId: all[0].id, userId: "u_host", text: "friends" });
    await setWelcomeQuestion(db, { gatheringId: gathering.id, userId: "u_host", question: "What are you hoping for?" });
    all = await db.select().from(rounds);
    expect(all).toHaveLength(2);
    expect(all.find((r) => r.welcome)?.phase).toBe("open");
    expect(all.find((r) => !r.welcome)?.phase).toBe("closed");

    const home = await gatheringHome(db, gathering, "u_host");
    expect(home.welcome?.question).toBe("What are you hoping for?");
  });

  it("keeps the welcome question to hosts", async () => {
    const amy = await member("amy");
    await expect(setWelcomeQuestion(db, { gatheringId: gathering.id, userId: amy, question: "Hi?" })).rejects.toBeInstanceOf(Refusal);
  });
});

describe("invitations", () => {
  it("lets a host invite directly, and only the invited email accept", async () => {
    const token = (await createInvite(db, { gatheringId: gathering.id, invitedBy: "u_host", email: " Ben@Example.com ", now: t0 })).token!;
    const ben = await person("ben");
    await person("eve");
    await expect(acceptInvite(db, { token, userId: "u_eve", userEmail: "eve@example.com", now: t0 })).rejects.toThrow(/ben@example.com/);
    const result = await acceptInvite(db, { token, userId: ben, userEmail: "ben@example.com", now: t0 });
    expect(result.gatheringSlug).toBe("tuesday-tables");
    expect((await findInvite(db, token, t0))?.state).toBe("accepted");
  });

  it("expires after 30 days, and a new invitation replaces the old", async () => {
    const first = await createInvite(db, { gatheringId: gathering.id, invitedBy: "u_host", email: "ben@example.com", now: t0 });
    expect((await findInvite(db, first.token!, days(31)))?.state).toBe("expired");
    await createInvite(db, { gatheringId: gathering.id, invitedBy: "u_host", email: "ben@example.com", now: t0 });
    expect((await findInvite(db, first.token!, t0))?.state).toBe("revoked");
  });

  it("refuses someone already in the gathering, and a stranger inviting", async () => {
    await member("amy");
    await expect(createInvite(db, { gatheringId: gathering.id, invitedBy: "u_host", email: "amy@example.com" })).rejects.toThrow(/already/);
    await person("eve");
    await expect(createInvite(db, { gatheringId: gathering.id, invitedBy: "u_eve", email: "x@example.com" })).rejects.toBeInstanceOf(Refusal);
  });

  it("stores only a hash of the token", async () => {
    const token = (await createInvite(db, { gatheringId: gathering.id, invitedBy: "u_host", email: "ben@example.com" })).token!;
    const [row] = await db.select().from(invites);
    expect(row.tokenHash).not.toContain(token);
  });

  it("joins the named circle on accept", async () => {
    const circle = await createCircle(db, { gatheringId: gathering.id, userId: "u_host", name: "Bread", now: t0 });
    const amy = await member("amy", circle.id);
    const home = await gatheringHome(db, gathering, amy);
    expect(home.circles.find((c) => c.id === circle.id)).toMatchObject({ isMember: true, members: 2 });
  });
});

describe("circles", () => {
  it("takes a colour, saffron by default, that only the host can change", async () => {
    const plain = await createCircle(db, { gatheringId: gathering.id, userId: "u_host", name: "Bread", now: t0 });
    expect(plain.color).toBe("saffron");
    await expect(createCircle(db, { gatheringId: gathering.id, userId: "u_host", name: "Walks", color: "beet" })).rejects.toThrow(Refusal);
    const moss = await createCircle(db, { gatheringId: gathering.id, userId: "u_host", name: "Walks", color: "moss" });
    expect(moss.color).toBe("moss");

    const amy = await member("amy", plain.id);
    await expect(setCircleColor(db, { circleId: plain.id, userId: amy, color: "plum" })).rejects.toThrow(Refusal);
    await setCircleColor(db, { circleId: plain.id, userId: "u_host", color: "plum" });
    const [after] = await db.select().from(circles).where(eq(circles.id, plain.id));
    expect(after.color).toBe("plum");
  });

  it("forms when the fourth person joins, with the first question queued", async () => {
    const circle = await createCircle(db, { gatheringId: gathering.id, userId: "u_host", name: "Bread", firstQuestion: "What fed you?", now: t0 });
    expect(circle.status).toBe("forming");
    expect(circle.formingExpiresAt).toEqual(days(7));
    const [first] = await db.select().from(rounds).where(eq(rounds.circleId, circle.id));
    expect(first.phase).toBe("queued");
    const [prompt] = await db.select().from(prompts).where(eq(prompts.id, first.promptId));
    expect(prompt.question).toBe("What fed you?");

    const [a, b, c] = [await member("a"), await member("b"), await member("c")];
    expect((await joinCircle(db, { circleId: circle.id, userId: a, now: t0 })).formed).toBe(false);
    expect((await joinCircle(db, { circleId: circle.id, userId: b, now: t0 })).formed).toBe(false);
    expect((await joinCircle(db, { circleId: circle.id, userId: c, now: t0 })).formed).toBe(true);
    const [after] = await db.select().from(circles).where(eq(circles.id, circle.id));
    expect(after.status).toBe("active");
    expect(after.formingExpiresAt).toBeNull();
  });

  it("stops at twelve", async () => {
    const circle = await createCircle(db, { gatheringId: gathering.id, userId: "u_host", name: "Big", now: t0 });
    for (let i = 1; i < CIRCLE_MAX; i++) await seatInCircle(db, { circleId: circle.id, userId: await member(`m${i}`), now: t0 });
    const late = await member("late");
    await expect(seatInCircle(db, { circleId: circle.id, userId: late, now: t0 })).rejects.toThrow(/full/);
  });

  it("expires an unformed proposal after the gathering's window", async () => {
    const circle = await createCircle(db, { gatheringId: gathering.id, userId: "u_host", name: "Quiet", now: t0 });
    expect(await expireProposals(db, days(6))).toEqual([]);
    expect(await expireProposals(db, days(8))).toEqual([circle.id]);
    const amy = await member("amy");
    await expect(joinCircle(db, { circleId: circle.id, userId: amy, now: days(8) })).rejects.toThrow(/expired/);
  });

  it("empties the host seat when the host leaves, and lets people rejoin", async () => {
    const circle = await createCircle(db, { gatheringId: gathering.id, userId: "u_host", name: "Bread", now: t0 });
    const amy = await member("amy", circle.id);
    await leaveCircle(db, { circleId: circle.id, userId: "u_host" });
    const [after] = await db.select().from(circles).where(eq(circles.id, circle.id));
    expect(after.hostId).toBeNull();
    await leaveCircle(db, { circleId: circle.id, userId: amy });
    await joinCircle(db, { circleId: circle.id, userId: amy, now: t0 });
    const home = await gatheringHome(db, gathering, amy);
    expect(home.circles[0]).toMatchObject({ isMember: true, members: 1 });
  });
});
