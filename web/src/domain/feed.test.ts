import { beforeEach, describe, expect, it } from "vitest";
import type { DB } from "@/db";
import { user } from "@/db/schema";
import { testDb } from "@/db/testing";
import { createCircle, joinCircle, type Circle } from "./circles";
import { createCommunity, type Community } from "./communities";
import { Refusal } from "./errors";
import { feed } from "./feed";
import { acceptInvite, createInvite } from "./invites";
import { postOpenQuestion, respond, revealNow, suggestRound, toggleSupport } from "./rounds";

let db: DB;
let community: Community;
let circles: Circle[];
const t0 = new Date("2026-10-01T12:00:00Z");
const at = (h: number) => new Date(t0.getTime() + h * 3_600_000);

async function member(name: string) {
  const id = `u_${name}`;
  await db.insert(user).values({ id, name, email: `${name}@example.com` });
  const { token } = await createInvite(db, { communityId: community.id, invitedBy: "u_host", email: `${name}@example.com`, now: t0 });
  await acceptInvite(db, { token, userId: id, userEmail: `${name}@example.com`, now: t0 });
  return id;
}

/** A formed circle of the host plus three. */
async function formed(name: string, people: string[]) {
  const c = await createCircle(db, { communityId: community.id, userId: "u_host", name, now: t0 });
  for (const p of people) await joinCircle(db, { circleId: c.id, userId: p, now: t0 });
  return c;
}

/** Run a prompt in a circle: suggest, support, and it opens. */
async function run(circle: Circle, prompt: Parameters<typeof suggestRound>[1]["prompt"], by: string, backer: string, h = 0) {
  const r = await suggestRound(db, { circleId: circle.id, userId: by, prompt, now: at(h) });
  await toggleSupport(db, { roundId: r.id, userId: backer, now: at(h) });
  return r;
}

beforeEach(async () => {
  db = await testDb();
  process.env.FERMENT_HOST_EMAILS = "host@example.com";
  await db.insert(user).values({ id: "u_host", name: "Host", email: "host@example.com" });
  community = await createCommunity(db, { userId: "u_host", userEmail: "host@example.com", name: "Tables" });
  const [a, b, c] = [await member("a"), await member("b"), await member("c")];
  circles = [await formed("One", [a, b, c]), await formed("Two", [a, b, c]), await formed("Three", [a, b, c])];
});

describe("the feed", () => {
  it("counts each circle that took a question up, and ranks by it", async () => {
    const first = await run(circles[0], { question: "What fed you?" }, "u_a", "u_b");
    await run(circles[1], { promptId: first.promptId }, "u_b", "u_c", 1);
    await run(circles[2], { question: "A lonely question" }, "u_a", "u_b", 2);

    const items = await feed(db, community.id, "u_a");
    expect(items.map((i) => [i.question, i.here, i.total])).toEqual([["What fed you?", 2, 3], ["A lonely question", 1, 3]]);
    expect(items[0].startedIn?.name).toBe("One");
    expect(items[0].openIn).toBe(2);
    expect(items[0].suggestable.map((c) => c.name)).toEqual(["Three"]);
  });

  it("counts adaptations toward the question they came from, and lists them", async () => {
    const first = await run(circles[0], { question: "Who do you call when it's hard?" }, "u_a", "u_b");
    await run(circles[1], { question: "Who do you call when you're stuck?", adaptedFromId: first.promptId }, "u_a", "u_b", 1);
    const items = await feed(db, community.id, "u_a");
    const parent = items.find((i) => i.question.includes("hard"))!;
    const child = items.find((i) => i.question.includes("stuck"))!;
    expect(parent.here).toBe(2);
    expect(parent.circles.find((c) => c.name === "Two")?.viaAdaptation).toBe(true);
    expect(parent.adaptations.map((a) => a.question)).toEqual(["Who do you call when you're stuck?"]);
    expect(child.adaptedFrom?.question).toBe("Who do you call when it's hard?");
    expect(child.here).toBe(1);
  });

  it("leaves out questions that are only suggested, and shows ones asked of everyone", async () => {
    await suggestRound(db, { circleId: circles[0].id, userId: "u_a", prompt: { question: "Not yet" }, now: t0 });
    const q = await postOpenQuestion(db, { communityId: community.id, userId: "u_a", prompt: { question: "Who cooks?" }, now: t0 });
    await respond(db, { roundId: q.id, userId: "u_b", input: { text: "me" }, now: t0 });
    const items = await feed(db, community.id, "u_a");
    expect(items.map((i) => i.question)).toEqual(["Who cooks?"]);
    expect(items[0].everyone).toMatchObject({ open: true, answered: 1 });
    expect(items[0].here).toBe(items[0].total);
  });

  it("won't suggest a question that's already waiting or open in the circle", async () => {
    const r = await run(circles[0], { question: "What fed you?" }, "u_a", "u_b");
    await expect(suggestRound(db, { circleId: circles[0].id, userId: "u_c", prompt: { promptId: r.promptId } })).rejects.toThrow(/open in this circle/);
    await revealNow(db, { roundId: r.id, userId: "u_a" });
    await expect(suggestRound(db, { circleId: circles[0].id, userId: "u_c", prompt: { promptId: r.promptId } })).resolves.toBeTruthy();
  });

  it("starts a circle around an existing question", async () => {
    const r = await run(circles[0], { question: "What fed you?" }, "u_a", "u_b");
    const fresh = await createCircle(db, { communityId: community.id, userId: "u_c", name: "Fed", promptId: r.promptId, now: t0 });
    expect(fresh.originPromptId).toBe(r.promptId);
    await expect(createCircle(db, { communityId: community.id, userId: "u_c", name: "Nope", promptId: "missing" })).rejects.toBeInstanceOf(Refusal);
  });
});
