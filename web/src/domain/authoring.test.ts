import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { DB } from "@/db";
import { prompts, user } from "@/db/schema";
import { testDb } from "@/db/testing";
import { deleteCircle, deleteRound, editQuestion } from "./authoring";
import { circleById, createCircle, joinCircle, seatInCircle, type Circle } from "./circles";
import { createGathering, listMyArchived, listMyGatherings, pinQuestion, setArchived, type Gathering } from "./gatherings";
import { acceptInvite, createInvite } from "./invites";
import { listNotifications } from "./notifications";
import { postOpenQuestion, respond, roundById, suggestRound, toggleSupport } from "./rounds";

let db: DB;
let gathering: Gathering;
let circle: Circle;
let people: string[]; // host + 4 members of the circle
const t0 = new Date("2026-10-01T12:00:00Z");

async function member(name: string) {
  const id = `u_${name}`;
  await db.insert(user).values({ id, name, email: `${name}@example.com` });
  const token = (await createInvite(db, { gatheringId: gathering.id, invitedBy: "u_host", email: `${name}@example.com`, now: t0 })).token!;
  await acceptInvite(db, { token, userId: id, userEmail: `${name}@example.com`, now: t0 });
  return id;
}

const promptOf = async (roundId: string) => (await roundById(db, roundId))!.promptId;
const promptExists = async (id: string) => (await db.select().from(prompts).where(eq(prompts.id, id))).length > 0;

beforeEach(async () => {
  db = await testDb();
  process.env.FERMENT_HOST_EMAILS = "host@example.com";
  await db.insert(user).values({ id: "u_host", name: "Host", email: "host@example.com" });
  gathering = await createGathering(db, { userId: "u_host", name: "Tables" });
  circle = await createCircle(db, { gatheringId: gathering.id, userId: "u_host", name: "Bread", now: t0 });
  people = ["u_host"];
  for (const n of ["amy", "ben", "cal", "dee"]) {
    const id = await member(n);
    await seatInCircle(db, { circleId: circle.id, userId: id, now: t0 });
    people.push(id);
  }
});

describe("editing a question", () => {
  it("lets its author fix the words until someone else takes it up", async () => {
    const [, amy, ben] = people;
    const r = await suggestRound(db, { circleId: circle.id, userId: amy, prompt: { question: "What fed yuo?" }, now: t0 });
    await expect(editQuestion(db, { roundId: r.id, userId: ben, question: "Mine now", context: "" })).rejects.toThrow(/wrote/);
    await editQuestion(db, { roundId: r.id, userId: amy, question: " What fed you? ", context: "This week." });
    const p = (await db.select().from(prompts).where(eq(prompts.id, r.promptId)))[0];
    expect(p).toMatchObject({ question: "What fed you?", context: "This week." });
    await expect(editQuestion(db, { roundId: r.id, userId: amy, question: "", context: "" })).rejects.toThrow(/Write/);

    // Opened, and the author's own answer doesn't settle it; someone else's does.
    await toggleSupport(db, { roundId: r.id, userId: ben, now: t0 });
    expect((await roundById(db, r.id))!.phase).toBe("open");
    await respond(db, { roundId: r.id, userId: amy, input: { text: "soup" }, now: t0 });
    await editQuestion(db, { roundId: r.id, userId: amy, question: "What fed you, really?", context: "" });
    await respond(db, { roundId: r.id, userId: ben, input: { text: "bread" }, now: t0 });
    await expect(editQuestion(db, { roundId: r.id, userId: amy, question: "Changed", context: "" })).rejects.toThrow(/taken this question up/);
  });

  it("stops once someone else picks the same question", async () => {
    const [, amy, ben] = people;
    const asked = await postOpenQuestion(db, { gatheringId: gathering.id, userId: amy, prompt: { question: "Where's home?" }, now: t0 });
    const other = await createCircle(db, { gatheringId: gathering.id, userId: ben, name: "Rye", now: t0 });
    for (const p of [people[2], people[3], people[4]]) if (p !== ben) await seatInCircle(db, { circleId: other.id, userId: p, now: t0 });
    await suggestRound(db, { circleId: other.id, userId: ben, prompt: { promptId: asked.promptId }, now: t0 });
    await expect(editQuestion(db, { roundId: asked.id, userId: amy, question: "Where is home?", context: "" })).rejects.toThrow(/taken/);
  });

  it("keeps the pinned question, but lets its author fix the words", async () => {
    const { id } = await postOpenQuestion(db, { gatheringId: gathering.id, userId: "u_host", prompt: { question: "What brought you?" } });
    await pinQuestion(db, { gatheringId: gathering.id, userId: "u_host", roundId: id });
    await editQuestion(db, { roundId: id, userId: "u_host", question: "What brought you here?", context: "" });
    await expect(deleteRound(db, { roundId: id, userId: "u_host" })).rejects.toThrow(/pinned/);
  });
});

describe("deleting a question", () => {
  it("removes a circle suggestion for good, author only, until it opens", async () => {
    const [host, amy, ben] = people;
    const r = await suggestRound(db, { circleId: circle.id, userId: amy, prompt: { question: "Gone soon" }, now: t0 });
    await expect(deleteRound(db, { roundId: r.id, userId: host })).rejects.toThrow(/asked/);
    await deleteRound(db, { roundId: r.id, userId: amy });
    expect(await roundById(db, r.id)).toBeNull();
    expect(await promptExists(r.promptId)).toBe(false);

    const opened = await suggestRound(db, { circleId: circle.id, userId: amy, prompt: { question: "Stays" }, now: t0 });
    await toggleSupport(db, { roundId: opened.id, userId: ben, now: t0 });
    await expect(deleteRound(db, { roundId: opened.id, userId: amy })).rejects.toThrow(/opened/);
  });

  it("deletes an open question until someone else answers", async () => {
    const [, amy, ben] = people;
    const q = await postOpenQuestion(db, { gatheringId: gathering.id, userId: amy, prompt: { question: "Test?" }, now: t0 });
    await respond(db, { roundId: q.id, userId: amy, input: { text: "mine" }, now: t0 });
    await deleteRound(db, { roundId: q.id, userId: amy });
    expect(await roundById(db, q.id)).toBeNull();
    expect(await promptExists(q.promptId)).toBe(false);

    const kept = await postOpenQuestion(db, { gatheringId: gathering.id, userId: amy, prompt: { question: "Kept?" }, now: t0 });
    await respond(db, { roundId: kept.id, userId: ben, input: { text: "here" }, now: t0 });
    await expect(deleteRound(db, { roundId: kept.id, userId: amy })).rejects.toThrow(/answered/);
    await expect(deleteRound(db, { roundId: kept.id, userId: "u_host" })).rejects.toThrow(/asked/);
  });

  it("keeps the question when something else still uses it", async () => {
    const [, amy] = people;
    const asked = await postOpenQuestion(db, { gatheringId: gathering.id, userId: amy, prompt: { question: "Twice?" }, now: t0 });
    const again = await suggestRound(db, { circleId: circle.id, userId: amy, prompt: { promptId: asked.promptId }, now: t0 });
    await deleteRound(db, { roundId: again.id, userId: amy });
    expect(await promptExists(await promptOf(asked.id))).toBe(true);
  });
});

describe("deleting a circle", () => {
  it("lets its creator delete it while forming, telling whoever joined by name", async () => {
    const [host, amy, ben] = people;
    const rye = await createCircle(db, { gatheringId: gathering.id, userId: amy, name: "Rye", firstQuestion: "What rises?", now: t0 });
    await joinCircle(db, { circleId: rye.id, userId: ben, now: t0 });
    await expect(deleteCircle(db, { circleId: rye.id, userId: ben })).rejects.toThrow(/started/);
    await deleteCircle(db, { circleId: rye.id, userId: amy, now: t0 });
    expect(await circleById(db, rye.id)).toBeNull();
    expect(await promptExists(rye.originPromptId!)).toBe(false);
    const takenDown = async (id: string) => (await listNotifications(db, { userId: id })).filter((n) => n.kind === "circle_removed");
    expect((await takenDown(ben)).map((n) => n.text)).toEqual(["amy took down Rye before it began."]);
    expect(await takenDown(host)).toHaveLength(0);
    expect(await takenDown(amy)).toHaveLength(0);
  });

  it("lets a formed circle go until a question is queued, then keeps it", async () => {
    const [, amy, ben, cal, dee] = people;
    const rye = await createCircle(db, { gatheringId: gathering.id, userId: amy, name: "Rye", now: t0 });
    for (const p of [ben, cal, dee]) await joinCircle(db, { circleId: rye.id, userId: p, now: t0 });
    expect((await circleById(db, rye.id))!.status).toBe("active");
    const r = await suggestRound(db, { circleId: rye.id, userId: ben, prompt: { question: "Only suggested" }, now: t0 });
    expect((await roundById(db, r.id))!.phase).toBe("nominated");
    const kept = await createCircle(db, { gatheringId: gathering.id, userId: amy, name: "Spelt", firstQuestion: "Begun?", now: t0 });
    for (const p of [ben, cal, dee]) await joinCircle(db, { circleId: kept.id, userId: p, now: t0 });
    await expect(deleteCircle(db, { circleId: kept.id, userId: amy })).rejects.toThrow(/begun/);
    await deleteCircle(db, { circleId: rye.id, userId: amy, now: t0 });
    expect(await circleById(db, rye.id)).toBeNull();
  });
});

describe("archiving a gathering from your list", () => {
  it("moves it off your own list only, and back", async () => {
    const [, amy, ben] = people;
    await setArchived(db, { gatheringId: gathering.id, userId: amy, archived: true, now: t0 });
    expect(await listMyGatherings(db, amy)).toHaveLength(0);
    expect((await listMyArchived(db, amy)).map((c) => c.id)).toEqual([gathering.id]);
    expect(await listMyGatherings(db, ben)).toHaveLength(1);
    expect(await listMyGatherings(db, "u_host")).toHaveLength(1);
    await setArchived(db, { gatheringId: gathering.id, userId: amy, archived: false });
    expect(await listMyGatherings(db, amy)).toHaveLength(1);
    await expect(setArchived(db, { gatheringId: "nope", userId: amy, archived: true })).rejects.toThrow(/member/);
  });
});
