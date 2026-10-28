import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { DB } from "@/db";
import { groups, invites, prompts, rounds, user } from "@/db/schema";
import { testDb } from "@/db/testing";
import { CIRCLE_MAX, createCircle, createLoneCircle, expireProposals, joinCircle, leaveCircle, promoteCircle, seatInCircle, setCircleColor } from "./circles";
import { gatheringHome, createGathering, pinQuestion, type Gathering } from "./gatherings";
import { Refusal } from "./errors";
import { acceptInvite, createInvite, findInvite } from "./invites";
import { listNotifications } from "./notifications";
import { postOpenQuestion, suggestRound } from "./rounds";

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
  gathering = await createGathering(db, { userId: "u_host", name: "Tuesday Tables" });
});

describe("gatherings", () => {
  it("lets anyone start one, and gives each a unique slug", async () => {
    await person("amy");
    expect((await createGathering(db, { userId: "u_amy", name: "Mine" })).createdBy).toBe("u_amy");
    const again = await createGathering(db, { userId: "u_host", name: "Tuesday Tables" });
    expect(gathering.slug).toBe("tuesday-tables");
    expect(again.slug).toBe("tuesday-tables-2");
  });

  it("puts the latest question to everyone at the centre until a host pins one, of any shape", async () => {
    const first = await postOpenQuestion(db, { gatheringId: gathering.id, userId: "u_host", prompt: { question: "What brought you?" }, now: t0 });
    const words = await postOpenQuestion(db, {
      gatheringId: gathering.id, userId: "u_host", now: new Date(t0.getTime() + 1000),
      prompt: { question: "Which words?", shape: "words", seedWords: ["bread", "salt"] },
    });
    let home = await gatheringHome(db, gathering, "u_host");
    expect(home.pinned).toMatchObject({ roundId: words.id, shape: "words", pinned: false });

    await pinQuestion(db, { gatheringId: gathering.id, userId: "u_host", roundId: first.id });
    home = await gatheringHome(db, { ...gathering, pinnedRoundId: first.id }, "u_host");
    expect(home.pinned).toMatchObject({ roundId: first.id, question: "What brought you?", pinned: true });

    await pinQuestion(db, { gatheringId: gathering.id, userId: "u_host", roundId: null });
    const [g] = await db.select().from(groups).where(eq(groups.id, gathering.id));
    expect(g.pinnedRoundId).toBeNull();
  });

  it("pins only an open question to everyone in this gathering, and only for hosts", async () => {
    const amy = await member("amy");
    const q = await postOpenQuestion(db, { gatheringId: gathering.id, userId: "u_host", prompt: { question: "Hi?" } });
    await expect(pinQuestion(db, { gatheringId: gathering.id, userId: amy, roundId: q.id })).rejects.toBeInstanceOf(Refusal);
    const circle = await createCircle(db, { gatheringId: gathering.id, userId: "u_host", name: "Bread", firstQuestion: "What fed you?", now: t0 });
    const [inCircle] = await db.select().from(rounds).where(eq(rounds.groupId, circle.id));
    await expect(pinQuestion(db, { gatheringId: gathering.id, userId: "u_host", roundId: inCircle.id })).rejects.toThrow(/to everyone/);
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
    const [after] = await db.select().from(groups).where(eq(groups.id, plain.id));
    expect(after.color).toBe("plum");
  });

  it("forms when the fourth person joins, with the first question queued", async () => {
    const circle = await createCircle(db, { gatheringId: gathering.id, userId: "u_host", name: "Bread", firstQuestion: "What fed you?", now: t0 });
    expect(circle.status).toBe("forming");
    expect(circle.formingExpiresAt).toEqual(days(7));
    const [first] = await db.select().from(rounds).where(eq(rounds.groupId, circle.id));
    expect(first.phase).toBe("queued");
    const [prompt] = await db.select().from(prompts).where(eq(prompts.id, first.promptId));
    expect(prompt.question).toBe("What fed you?");

    const [a, b, c] = [await member("a"), await member("b"), await member("c")];
    expect((await joinCircle(db, { circleId: circle.id, userId: a, now: t0 })).formed).toBe(false);
    expect((await joinCircle(db, { circleId: circle.id, userId: b, now: t0 })).formed).toBe(false);
    expect((await joinCircle(db, { circleId: circle.id, userId: c, now: t0 })).formed).toBe(true);
    const [after] = await db.select().from(groups).where(eq(groups.id, circle.id));
    expect(after.status).toBe("active");
    expect(after.formingExpiresAt).toBeNull();
  });

  it("takes a whole round as its first question: shape, reveal and timer, and opens it with the timer running", async () => {
    const circle = await createCircle(db, {
      gatheringId: gathering.id, userId: "u_host", name: "Rye", now: t0, timerHours: "72",
      firstQuestion: { question: "Where is it in its life?", context: "Place it, then tell it.", shape: "story_placement", telling: "text", reveal: "after_share", axes: [{ poleA: "Just beginning", poleB: "Coming apart" }] },
    });
    const [first] = await db.select().from(rounds).where(eq(rounds.groupId, circle.id));
    expect(first).toMatchObject({ phase: "queued", timerHours: 72 });
    const [prompt] = await db.select().from(prompts).where(eq(prompts.id, first.promptId));
    expect(prompt).toMatchObject({ shape: "story_placement", telling: "text", reveal: "after_share", context: "Place it, then tell it." });
    expect(prompt.axes).toEqual([{ poleA: "Just beginning", poleB: "Coming apart" }]);

    for (const n of ["a", "b", "c"]) await joinCircle(db, { circleId: circle.id, userId: await member(n), now: t0 });
    const [opened] = await db.select().from(rounds).where(eq(rounds.groupId, circle.id));
    expect(opened.phase).toBe("open");
    expect(opened.closesAt).toEqual(new Date(t0.getTime() + 72 * 3600_000));
    // A bad timer or a placement without a line is refused before anything is made.
    await expect(createCircle(db, { gatheringId: gathering.id, userId: "u_host", name: "Spelt", firstQuestion: "Q?", timerHours: "0", now: t0 })).rejects.toThrow(Refusal);
    await expect(createCircle(db, { gatheringId: gathering.id, userId: "u_host", name: "Spelt", firstQuestion: { question: "Q?", shape: "placement" }, now: t0 })).rejects.toThrow(Refusal);
    expect((await db.select().from(groups).where(eq(groups.name, "Spelt"))).length).toBe(0);
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
    const [after] = await db.select().from(groups).where(eq(groups.id, circle.id));
    expect(after.hostId).toBeNull();
    await leaveCircle(db, { circleId: circle.id, userId: amy });
    await joinCircle(db, { circleId: circle.id, userId: amy, now: t0 });
    const home = await gatheringHome(db, gathering, amy);
    expect(home.circles[0]).toMatchObject({ isMember: true, members: 1 });
  });
});

describe("a circle on its own", () => {
  /** Invite someone to a circle on its own and have them arrive. */
  async function arrive(circle: { id: string }, name: string) {
    const id = await person(name);
    const { token } = await createInvite(db, { gatheringId: circle.id, invitedBy: "u_host", email: `${name}@example.com`, now: t0 });
    await acceptInvite(db, { token: token!, userId: id, userEmail: `${name}@example.com`, now: t0 });
    return id;
  }

  it("starts with its host seated, fills by invitation, and forms at four", async () => {
    const circle = await createLoneCircle(db, { userId: "u_host", name: "Soup", firstQuestion: "What soup do you make?", now: t0 });
    expect(circle).toMatchObject({ kind: "circle", parentId: null, rootId: circle.id, status: "forming", hostId: "u_host" });
    expect((await db.select().from(rounds).where(eq(rounds.groupId, circle.id)))[0]).toMatchObject({ rootId: circle.id, phase: "queued" });
    expect((await db.select().from(prompts))[0].rootId).toBe(circle.id);

    for (const n of ["amy", "ben"]) await arrive(circle, n);
    expect((await db.select().from(groups).where(eq(groups.id, circle.id)))[0].status).toBe("forming");
    await arrive(circle, "cal");
    const [formed] = await db.select().from(groups).where(eq(groups.id, circle.id));
    expect(formed.status).toBe("active");
    expect((await db.select().from(rounds).where(eq(rounds.groupId, circle.id)))[0].phase).toBe("open");
    // It's on everyone's list as a circle, and only the host hosts it.
    const mine = await (await import("./gatherings")).listMyGatherings(db, "u_amy");
    expect(mine.map((g) => [g.slug, g.kind, g.role])).toEqual([["soup", "circle", "member"]]);
    // A circle on its own has nothing to open a round to.
    await expect(postOpenQuestion(db, { gatheringId: circle.id, userId: "u_host", prompt: { question: "Everyone?" } })).rejects.toThrow(/gathering/);
  });

  it("takes a words question with a timer as its first round", async () => {
    const circle = await createLoneCircle(db, {
      userId: "u_host", name: "Soup", now: t0, timerHours: 24, color: "moss",
      firstQuestion: { question: "Which of these is in the pot?", shape: "words", seedWords: ["rest", "ginger", "salt"], pickMax: 2, coinMax: 1 },
    });
    const [first] = await db.select().from(rounds).where(eq(rounds.groupId, circle.id));
    expect(first).toMatchObject({ phase: "queued", timerHours: 24, rootId: circle.id });
    const [prompt] = await db.select().from(prompts).where(eq(prompts.id, first.promptId));
    expect(prompt).toMatchObject({ shape: "words", pickMax: 2, coinMax: 1, rootId: circle.id });
    expect(prompt.seedWords).toEqual(["rest", "ginger", "salt"]);
    expect(circle.color).toBe("moss");
  });

  it("counts against the same day's allowance as a gathering", async () => {
    await person("amy");
    for (let i = 1; i < 5; i++) await createLoneCircle(db, { userId: "u_amy", name: `Circle ${i}`, now: t0 });
    await createGathering(db, { userId: "u_amy", name: "The fifth", now: t0 });
    await expect(createGathering(db, { userId: "u_amy", name: "One more", now: t0 })).rejects.toThrow(/today/);
    await expect(createLoneCircle(db, { userId: "u_amy", name: "Or this", now: t0 })).rejects.toThrow(/today/);
  });

  it("grows into a gathering: moves under it, keeps its address and everything in it, seats everyone", async () => {
    const circle = await createLoneCircle(db, { userId: "u_host", name: "Soup", firstQuestion: "What soup?", now: t0 });
    for (const n of ["amy", "ben", "cal"]) await arrive(circle, n);
    await suggestRound(db, { circleId: circle.id, userId: "u_amy", prompt: { question: "Hot or cold?" }, now: t0 });
    const before = await listNotifications(db, { userId: "u_host" });
    expect(before.length).toBeGreaterThan(0);

    await expect(promoteCircle(db, { circleId: circle.id, userId: "u_amy", name: "Soup Nights" })).rejects.toThrow(/host/);
    const g = await promoteCircle(db, { circleId: circle.id, userId: "u_host", name: "Soup Nights", welcomeNote: "Soup, weekly.", now: t0 });
    expect(g).toMatchObject({ kind: "gathering", slug: "soup-nights", note: "Soup, weekly.", createdBy: "u_host" });

    const [moved] = await db.select().from(groups).where(eq(groups.id, circle.id));
    expect(moved).toMatchObject({ slug: "soup", parentId: g.id, rootId: g.id, hostId: "u_host" });
    expect((await db.select().from(rounds).where(eq(rounds.groupId, circle.id))).every((r) => r.rootId === g.id)).toBe(true);
    expect((await db.select().from(prompts)).every((p) => p.rootId === g.id)).toBe(true);
    expect((await listNotifications(db, { userId: "u_host" })).every((n) => n.gatheringId === g.id)).toBe(true);

    const home = await gatheringHome(db, g, "u_amy");
    expect(home.members.map((m) => [m.userId, m.role]).sort()).toEqual([["u_amy", "member"], ["u_ben", "member"], ["u_cal", "member"], ["u_host", "host"]]);
    expect(home.circles.map((c) => [c.name, c.members, c.isMember])).toEqual([["Soup", 4, true]]);
    await expect(promoteCircle(db, { circleId: circle.id, userId: "u_host", name: "Again" })).rejects.toThrow(/already/);
    // And now it has somewhere to ask everyone.
    await postOpenQuestion(db, { gatheringId: g.id, userId: "u_amy", prompt: { question: "Best soup in town?" } });
  });
});
