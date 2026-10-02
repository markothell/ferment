import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { DB } from "@/db";
import { communityMembers, notifications, user } from "@/db/schema";
import { testDb } from "@/db/testing";
import { createCircle, seatInCircle, type Circle } from "./circles";
import { createCommunity, type Community } from "./communities";
import { acceptInvite, createInvite } from "./invites";
import { dueEmails, listNotifications, markAllRead, markEmailed, setEmailPref, unreadCount } from "./notifications";
import { postOpenQuestion, respond, revealNow, suggestRound, toggleSupport } from "./rounds";

let db: DB;
let community: Community;
let circle: Circle;
const t0 = new Date("2026-10-01T12:00:00Z");
const hours = (n: number) => new Date(t0.getTime() + n * 3_600_000);

async function member(name: string) {
  const id = `u_${name}`;
  await db.insert(user).values({ id, name, email: `${name}@example.com` });
  const token = (await createInvite(db, { communityId: community.id, invitedBy: "u_host", email: `${name}@example.com`, now: t0 })).token!;
  await acceptInvite(db, { token, userId: id, userEmail: `${name}@example.com`, now: t0 });
  return id;
}
const kinds = async (userId: string) => (await listNotifications(db, { userId })).map((n) => n.kind).sort();

beforeEach(async () => {
  db = await testDb();
  process.env.FERMENT_HOST_EMAILS = "host@example.com";
  await db.insert(user).values({ id: "u_host", name: "Host", email: "host@example.com" });
  community = await createCommunity(db, { userId: "u_host", userEmail: "host@example.com", name: "Tables" });
  circle = await createCircle(db, { communityId: community.id, userId: "u_host", name: "Bread", firstQuestion: "What fed you?", now: t0 });
  for (const n of ["amy", "ben", "cal"]) await seatInCircle(db, { circleId: circle.id, userId: await member(n), now: t0 });
});

describe("notifications", () => {
  it("tells a circle it has formed and its first question is open, but not the person who filled it", async () => {
    expect(await kinds("u_amy")).toEqual(["circle_formed", "round_opened"]);
    expect(await kinds("u_cal")).toEqual(["round_opened"]);
  });

  it("tells the circle about a suggestion waiting for support, and about reveals", async () => {
    const r = await suggestRound(db, { circleId: circle.id, userId: "u_amy", prompt: { question: "A meal?" }, now: hours(1) });
    expect(await kinds("u_ben")).toContain("suggested");
    expect((await kinds("u_amy")).filter((k) => k === "suggested")).toHaveLength(0);
    await toggleSupport(db, { roundId: r.id, userId: "u_ben", now: hours(2) });
    await revealNow(db, { roundId: r.id, userId: "u_amy", now: hours(3) });
    const cal = await listNotifications(db, { userId: "u_cal" });
    expect(cal[0]).toMatchObject({ kind: "round_revealed", text: "Everyone's answers to “A meal?” are in, in Bread." });
    expect(cal[0].href).toBe(`/c/${community.slug}/r/${r.id}`);
  });

  it("tells everyone about a question to everyone, and the asker about answers, once while unread", async () => {
    const dee = await member("dee");
    const q = await postOpenQuestion(db, { communityId: community.id, userId: "u_amy", prompt: { question: "Who cooks?" }, now: t0 });
    expect(await kinds(dee)).toContain("asked_everyone");
    await respond(db, { roundId: q.id, userId: "u_ben", input: { text: "me" }, now: t0 });
    await respond(db, { roundId: q.id, userId: "u_cal", input: { text: "not me" }, now: t0 });
    expect((await kinds("u_amy")).filter((k) => k === "answered")).toHaveLength(1);
  });

  it("counts and clears unread", async () => {
    expect(await unreadCount(db, "u_amy")).toBe(2);
    await markAllRead(db, "u_amy");
    expect(await unreadCount(db, "u_amy")).toBe(0);
  });
});

describe("email", () => {
  it("sends each-event mail at once, grouped per person per community", async () => {
    const due = await dueEmails(db, hours(1));
    const amy = due.find((b) => b.userId === "u_amy")!;
    expect(amy.ids).toHaveLength(2);
    await markEmailed(db, amy.ids, hours(1));
    expect((await dueEmails(db, hours(1))).find((b) => b.userId === "u_amy")).toBeUndefined();
  });

  it("holds a digest until the oldest has waited a day, and sends nothing when off", async () => {
    await setEmailPref(db, { communityId: community.id, userId: "u_amy", pref: "digest" });
    await setEmailPref(db, { communityId: community.id, userId: "u_ben", pref: "off" });
    let due = await dueEmails(db, hours(5));
    expect(due.map((b) => b.userId)).not.toContain("u_amy");
    expect(due.map((b) => b.userId)).not.toContain("u_ben");
    const ben = await db.select().from(notifications).where(eq(notifications.userId, "u_ben"));
    expect(ben.every((n) => n.emailedAt)).toBe(true);
    due = await dueEmails(db, hours(25));
    expect(due.map((b) => b.userId)).toContain("u_amy");
  });

  it("never emails what's already been read", async () => {
    await markAllRead(db, "u_amy");
    expect((await dueEmails(db, hours(1))).map((b) => b.userId)).not.toContain("u_amy");
    const [m] = await db.select().from(communityMembers).where(eq(communityMembers.userId, "u_amy"));
    expect(m.email).toBe("each");
  });
});
