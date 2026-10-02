import { beforeEach, describe, expect, it } from "vitest";
import type { DB } from "@/db";
import { responses, user } from "@/db/schema";
import { testDb } from "@/db/testing";
import { createCircle, seatInCircle, type Circle } from "./circles";
import { createCommunity, type Community } from "./communities";
import { acceptInvite, createInvite } from "./invites";
import { replyContext, repliesTo, suggestReply } from "./replies";
import { approvalsNeeded, postOpenQuestion, respond, revealNow, roundById, suggestRound, toggleSupport } from "./rounds";

let db: DB;
let community: Community;
let circle: Circle;
let people: string[]; // host + 4 members of the circle
const t0 = new Date("2026-10-01T12:00:00Z");

async function member(name: string) {
  const id = `u_${name}`;
  await db.insert(user).values({ id, name, email: `${name}@example.com` });
  const token = (await createInvite(db, { communityId: community.id, invitedBy: "u_host", email: `${name}@example.com`, now: t0 })).token!;
  await acceptInvite(db, { token, userId: id, userEmail: `${name}@example.com`, now: t0 });
  return id;
}

const phase = async (id: string) => (await roundById(db, id))!.phase;

/** A round everyone has seen: opened, answered by amy and ben, closed. */
async function explored(question = "What fed you?", reveal: "open" | "after_share" | "sealed" = "sealed") {
  const r = await suggestRound(db, { circleId: circle.id, userId: people[1], prompt: { question, reveal }, now: t0 });
  await toggleSupport(db, { roundId: r.id, userId: people[2], now: t0 });
  await respond(db, { roundId: r.id, userId: people[1], input: { text: "Bread" }, now: t0 });
  await respond(db, { roundId: r.id, userId: people[2], input: { text: "Soup" }, now: t0 });
  return r.id;
}

beforeEach(async () => {
  db = await testDb();
  process.env.FERMENT_HOST_EMAILS = "host@example.com";
  await db.insert(user).values({ id: "u_host", name: "Host", email: "host@example.com" });
  community = await createCommunity(db, { userId: "u_host", userEmail: "host@example.com", name: "Tables" });
  circle = await createCircle(db, { communityId: community.id, userId: "u_host", name: "Bread", now: t0 });
  people = ["u_host"];
  for (const n of ["amy", "ben", "cal", "dee"]) {
    const id = await member(n);
    await seatInCircle(db, { circleId: circle.id, userId: id, now: t0 });
    people.push(id);
  }
});

describe("replies", () => {
  it("need the author and one other, within the circle's own bounds", () => {
    expect(approvalsNeeded({ approvalsToStart: null }, 12, { reply: true })).toBe(2);
    expect(approvalsNeeded({ approvalsToStart: 1 }, 12, { reply: true })).toBe(1);
    expect(approvalsNeeded({ approvalsToStart: null }, 1, { reply: true })).toBe(1);
    expect(approvalsNeeded({ approvalsToStart: 9 }, 12)).toBe(9);
  });

  it("go through the circle machine as rounds, with lighter support", async () => {
    const parent = await explored();
    await revealNow(db, { roundId: parent, userId: people[1], now: t0 });
    const reply = await suggestReply(db, { roundId: parent, userId: people[3], prompt: { question: "What did the soup remind you of?" }, now: t0 });
    expect(reply.replyToRoundId).toBe(parent);
    expect(reply.phase).toBe("nominated");
    await toggleSupport(db, { roundId: reply.id, userId: people[4], now: t0 });
    expect(await phase(reply.id)).toBe("open");
  });

  it("wait for what the replier can see", async () => {
    const sealed = await explored("Sealed?", "sealed");
    await expect(suggestReply(db, { roundId: sealed, userId: people[3], prompt: { question: "Too soon?" }, now: t0 })).rejects.toThrow(/closes/);

    const afterShare = await explored("After share?", "after_share");
    await expect(suggestReply(db, { roundId: afterShare, userId: people[3], prompt: { question: "Before sharing?" }, now: t0 })).rejects.toThrow(/Share yours/);
    await respond(db, { roundId: afterShare, userId: people[3], input: { text: "Mine" }, now: t0 });
    await expect(suggestReply(db, { roundId: afterShare, userId: people[3], prompt: { question: "After sharing?" }, now: t0 })).resolves.toBeTruthy();

    const waiting = await suggestRound(db, { circleId: circle.id, userId: people[1], prompt: { question: "Not yet" }, now: t0 });
    await expect(suggestReply(db, { roundId: waiting.id, userId: people[2], prompt: { question: "Nothing to answer" }, now: t0 })).rejects.toThrow(/answered/);

    const open = await postOpenQuestion(db, { communityId: community.id, userId: people[1], prompt: { question: "Everyone?" }, now: t0 });
    await expect(suggestReply(db, { roundId: open.id, userId: people[2], prompt: { question: "Replying" }, now: t0 })).rejects.toThrow(/Open questions/);
  });

  it("can point at one answer, from that round only", async () => {
    const parent = await explored();
    await revealNow(db, { roundId: parent, userId: people[1], now: t0 });
    const other = await explored("Another?", "open");
    const answers = await db.select().from(responses);
    const ben = answers.find((a) => a.roundId === parent && a.userId === people[2])!;
    const elsewhere = answers.find((a) => a.roundId === other)!;

    await expect(
      suggestReply(db, { roundId: parent, userId: people[3], prompt: { question: "Wrong one" }, responseId: elsewhere.id, now: t0 }),
    ).rejects.toThrow(/isn't part/);
    const reply = await suggestReply(db, { roundId: parent, userId: people[3], prompt: { question: "Ben, say more?" }, responseId: ben.id, now: t0 });

    const ctx = await replyContext(db, reply, people[4]);
    expect(ctx?.chain.map((c) => c.question)).toEqual(["What fed you?"]);
    expect(ctx?.answer).toMatchObject({ name: "ben", text: "Soup" });

    const listed = await repliesTo(db, parent, people[3]);
    expect(listed).toMatchObject([{ id: reply.id, question: "Ben, say more?", author: "you", phase: "nominated", shared: 0 }]);
  });

  it("chain: a reply to a reply knows the whole way back", async () => {
    const parent = await explored();
    await revealNow(db, { roundId: parent, userId: people[1], now: t0 });
    const first = await suggestReply(db, { roundId: parent, userId: people[3], prompt: { question: "Why soup?", reveal: "open" }, now: t0 });
    await toggleSupport(db, { roundId: first.id, userId: people[4], now: t0 });
    await respond(db, { roundId: first.id, userId: people[4], input: { text: "Winter" }, now: t0 });
    const second = await suggestReply(db, { roundId: first.id, userId: people[2], prompt: { question: "Which winter?" }, now: t0 });
    const ctx = await replyContext(db, second, people[1]);
    expect(ctx?.chain.map((c) => c.question)).toEqual(["What fed you?", "Why soup?"]);
  });
});
