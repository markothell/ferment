import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { DB } from "@/db";
import { rounds, user } from "@/db/schema";
import { testDb } from "@/db/testing";
import { createCircle, seatInCircle, leaveCircle, type Circle } from "./circles";
import { createCommunity, setWelcomeQuestion, updateWelcomeNote, type Community } from "./communities";
import { Refusal } from "./errors";
import { acceptInvite, createInvite } from "./invites";
import { normalizePrompt } from "./prompts";
import {
  approvalsNeeded, postOpenQuestion, promoteRound, respond, revealNow, roundById, roundView,
  suggestRound, toggleSupport, visibility,
} from "./rounds";

let db: DB;
let community: Community;
let circle: Circle;
let people: string[]; // host + 4 members of the circle
const t0 = new Date("2026-10-01T12:00:00Z");
const hours = (n: number) => new Date(t0.getTime() + n * 3_600_000);

async function member(name: string) {
  const id = `u_${name}`;
  await db.insert(user).values({ id, name, email: `${name}@example.com` });
  const token = (await createInvite(db, { communityId: community.id, invitedBy: "u_host", email: `${name}@example.com`, now: t0 })).token!;
  await acceptInvite(db, { token, userId: id, userEmail: `${name}@example.com`, now: t0 });
  return id;
}

const phase = async (id: string) => (await roundById(db, id))!.phase;

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

describe("prompts", () => {
  it("fills defaults and refuses what doesn't fit", () => {
    expect(normalizePrompt({ question: " What fed you? " })).toMatchObject({
      question: "What fed you?", shape: "story", telling: "voice", secondsPerNote: 60, reveal: "sealed", placing: null,
    });
    expect(() => normalizePrompt({ question: "Where?", shape: "placement" })).toThrow(Refusal);
    expect(() => normalizePrompt({ question: "Where?", shape: "placement", axes: [{ poleA: "near", poleB: "Near" }] })).toThrow(/differ/);
    expect(normalizePrompt({ question: "Which?", shape: "words", seedWords: ["Rest", "rest ", "play"] }).seedWords).toEqual(["Rest", "play"]);
  });
});

describe("the circle machine", () => {
  it("needs a third of members to queue, at least two", () => {
    expect(approvalsNeeded({ approvalsToStart: null }, 5)).toBe(2);
    expect(approvalsNeeded({ approvalsToStart: null }, 12)).toBe(4);
    expect(approvalsNeeded({ approvalsToStart: 9 }, 5)).toBe(5);
  });

  it("queues on support and opens into a free slot", async () => {
    const r = await suggestRound(db, { circleId: circle.id, userId: people[1], prompt: { question: "What fed you?" }, now: t0 });
    expect(r.phase).toBe("nominated");
    await toggleSupport(db, { roundId: r.id, userId: people[2], now: t0 });
    expect(await phase(r.id)).toBe("open");
  });

  it("holds the queue at maxLive, and opens the next when one closes", async () => {
    const opened: string[] = [];
    for (let i = 0; i < 4; i++) {
      const r = await suggestRound(db, { circleId: circle.id, userId: people[1], prompt: { question: `Q${i}` }, now: t0 });
      await toggleSupport(db, { roundId: r.id, userId: people[2], now: t0 });
      opened.push(r.id);
    }
    expect(await Promise.all(opened.map(phase))).toEqual(["open", "open", "open", "queued"]);
    await revealNow(db, { roundId: opened[0], userId: people[1], now: t0 });
    expect(await phase(opened[3])).toBe("open");
  });

  it("lets the host promote past support, and to the front", async () => {
    const rs = [];
    for (let i = 0; i < 3; i++) {
      const r = await suggestRound(db, { circleId: circle.id, userId: people[1], prompt: { question: `Fill ${i}` }, now: t0 });
      await toggleSupport(db, { roundId: r.id, userId: people[2], now: t0 });
      rs.push(r);
    }
    const waiting = await suggestRound(db, { circleId: circle.id, userId: people[3], prompt: { question: "Queued" }, now: t0 });
    await toggleSupport(db, { roundId: waiting.id, userId: people[4], now: t0 });
    const promoted = await suggestRound(db, { circleId: circle.id, userId: people[3], prompt: { question: "Promoted" }, now: t0 });
    await expect(promoteRound(db, { roundId: promoted.id, userId: people[1] })).rejects.toThrow(/host/);
    await promoteRound(db, { roundId: promoted.id, userId: "u_host", now: t0 });
    await revealNow(db, { roundId: rs[0].id, userId: people[1], now: t0 });
    expect(await phase(promoted.id)).toBe("open");
    expect(await phase(waiting.id)).toBe("queued");
  });

  it("opens nothing while the circle is forming or has no host", async () => {
    const forming = await createCircle(db, { communityId: community.id, userId: people[1], name: "New", firstQuestion: "First?", now: t0 });
    const [first] = await db.select().from(rounds).where(eq(rounds.circleId, forming.id));
    expect(first.phase).toBe("queued");
    for (const p of people.slice(2)) await seatInCircle(db, { circleId: forming.id, userId: p, now: t0 });
    expect(await phase(first.id)).toBe("open"); // formed at 4 → opened

    await leaveCircle(db, { circleId: circle.id, userId: "u_host" });
    const r = await suggestRound(db, { circleId: circle.id, userId: people[1], prompt: { question: "Hosted?" }, now: t0 });
    await toggleSupport(db, { roundId: r.id, userId: people[2], now: t0 });
    expect(await phase(r.id)).toBe("queued");
  });
});

describe("responding and closing", () => {
  async function openRound(extra: Parameters<typeof suggestRound>[1]["prompt"] = { question: "What fed you?" }, settings = {}) {
    const r = await suggestRound(db, { circleId: circle.id, userId: people[1], prompt: extra, now: t0, ...settings });
    await toggleSupport(db, { roundId: r.id, userId: people[2], now: t0 });
    return r.id;
  }

  it("closes when every member has responded, and takes late responses after", async () => {
    const id = await openRound();
    for (const p of people.slice(0, 4)) await respond(db, { roundId: id, userId: p, input: { text: `from ${p}` }, now: t0 });
    expect(await phase(id)).toBe("open");
    await respond(db, { roundId: id, userId: people[4], input: { text: "last" }, now: t0 });
    const closed = (await roundById(db, id))!;
    expect(closed.phase).toBe("closed");
    expect(closed.closedVia).toBe("complete");

    const late = await member("eve");
    await seatInCircle(db, { circleId: circle.id, userId: late, now: t0 });
    await respond(db, { roundId: id, userId: late, input: { text: "late" }, now: t0 });
    expect((await roundView(db, id, late, t0)).responses).toHaveLength(6);
  });

  it("closes on its timer, when read", async () => {
    const id = await openRound({ question: "Timed" }, { timerHours: 24 });
    await roundView(db, id, people[1], hours(23));
    expect(await phase(id)).toBe("open");
    await roundView(db, id, people[1], hours(25));
    expect((await roundById(db, id))!.closedVia).toBe("timer");
  });

  it("freezes all but text after the close, and audio from the start", async () => {
    const id = await openRound({ question: "Where are you?", shape: "story_placement", axes: [{ poleA: "rested", poleB: "worn" }] });
    await respond(db, { roundId: id, userId: people[1], input: { text: "tired", audioUrl: "/api/audio/local/take1.m4a", x: 0.8 }, now: t0 });
    await respond(db, { roundId: id, userId: people[1], input: { audioUrl: "/api/audio/local/take2.m4a", x: 0.6 }, now: t0 });
    let mine = (await roundView(db, id, people[1], t0)).mine!;
    expect(mine.audioUrl).toBe("/api/audio/local/take1.m4a");
    expect(mine.x).toBe(0.6);

    await revealNow(db, { roundId: id, userId: people[1], now: t0 });
    await respond(db, { roundId: id, userId: people[1], input: { text: "rested now", x: 0.1 }, now: t0 });
    mine = (await roundView(db, id, people[1], t0)).mine!;
    expect(mine.text).toBe("rested now");
    expect(mine.x).toBe(0.6);
  });

  it("only takes recordings from our own storage", async () => {
    const id = await openRound();
    await expect(respond(db, { roundId: id, userId: people[1], input: { audioUrl: "https://evil.example/x.m4a" } })).rejects.toThrow(/didn't come from here/);
    await expect(respond(db, { roundId: id, userId: people[1], input: { audioUrl: "https://other.public.blob.vercel-storage.com/rounds/r1/take.m4a" } })).rejects.toThrow(/didn't come from here/);
    await respond(db, { roundId: id, userId: people[1], input: { audioUrl: "/api/audio/local/take9.m4a", audioSeconds: 12 } });
  });

  it("requires the shape's parts", async () => {
    const id = await openRound({ question: "Where?", shape: "placement", axes: [{ poleA: "a", poleB: "b" }, { poleA: "c", poleB: "d" }] });
    await expect(respond(db, { roundId: id, userId: people[1], input: { x: 0.5 } })).rejects.toThrow(/square/);
    await expect(respond(db, { roundId: id, userId: people[1], input: { x: 2, y: 0.5 } })).rejects.toThrow(Refusal);
    const story = await openRound({ question: "Tell" });
    await expect(respond(db, { roundId: story, userId: people[1], input: { text: "  " } })).rejects.toThrow(/Say something/);
  });

  it("keeps outsiders out", async () => {
    const id = await openRound();
    const eve = await member("eve");
    await expect(respond(db, { roundId: id, userId: eve, input: { text: "hi" } })).rejects.toThrow(/not part/);
    expect((await roundView(db, id, eve, t0)).responses).toEqual([]);
  });
});

describe("reveal", () => {
  it("follows open / after you share / sealed", () => {
    expect(visibility("open", false, false)).toBe("all");
    expect(visibility("after_share", false, false)).toBe("after_share");
    expect(visibility("after_share", false, true)).toBe("all");
    expect(visibility("sealed", false, true)).toBe("own");
    expect(visibility("sealed", true, false)).toBe("all");
  });

  it("shows a sealed round's responses only once it closes", async () => {
    const r = await suggestRound(db, { circleId: circle.id, userId: people[1], prompt: { question: "Sealed", reveal: "sealed" }, now: t0 });
    await toggleSupport(db, { roundId: r.id, userId: people[2], now: t0 });
    await respond(db, { roundId: r.id, userId: people[1], input: { text: "one" }, now: t0 });
    await respond(db, { roundId: r.id, userId: people[2], input: { text: "two" }, now: t0 });
    const before = await roundView(db, r.id, people[2], t0);
    expect(before.responses.map((x) => x.text)).toEqual(["two"]);
    expect(before.responders).toHaveLength(2);
    expect(before.aggregate).toBeNull();
    await revealNow(db, { roundId: r.id, userId: people[1], now: t0 });
    expect((await roundView(db, r.id, people[2], t0)).responses).toHaveLength(2);
  });

  it("opens an after-share wall to those who've shared", async () => {
    const r = await suggestRound(db, { circleId: circle.id, userId: people[1], prompt: { question: "After", reveal: "after_share" }, now: t0 });
    await toggleSupport(db, { roundId: r.id, userId: people[2], now: t0 });
    await respond(db, { roundId: r.id, userId: people[1], input: { text: "one" }, now: t0 });
    expect((await roundView(db, r.id, people[2], t0)).responses).toEqual([]);
    await respond(db, { roundId: r.id, userId: people[2], input: { text: "two" }, now: t0 });
    expect((await roundView(db, r.id, people[2], t0)).responses).toHaveLength(2);
  });

});

describe("words", () => {
  it("picks from the seed list, coins new words, and sizes the portrait", async () => {
    const r = await suggestRound(db, {
      circleId: circle.id, userId: people[1], now: t0,
      prompt: { question: "This week in a word?", shape: "words", seedWords: ["rest", "play", "grief"], pickMax: 2, coinMax: 1, reveal: "open" },
    });
    await toggleSupport(db, { roundId: r.id, userId: people[2], now: t0 });
    const vocab = (await roundView(db, r.id, people[1], t0)).vocabulary;
    const id = (l: string) => vocab.find((w) => w.label === l)!.id;
    await respond(db, { roundId: r.id, userId: people[1], input: { pick: [id("rest"), id("play")], coin: ["Soup"] }, now: t0 });
    await respond(db, { roundId: r.id, userId: people[2], input: { pick: [id("rest")], coin: ["soup "] }, now: t0 });
    await expect(respond(db, { roundId: r.id, userId: people[3], input: { pick: [id("rest"), id("play"), id("grief")] } })).rejects.toThrow(/up to 2/);
    const view = await roundView(db, r.id, people[1], t0);
    expect(view.aggregate!.words).toEqual([
      { label: "rest", count: 2 }, { label: "Soup", count: 2 }, { label: "play", count: 1 },
    ]);
  });
});

describe("open questions", () => {
  it("open at once to the whole community, and hosts can reserve them", async () => {
    const eve = await member("eve");
    const q = await postOpenQuestion(db, { communityId: community.id, userId: eve, prompt: { question: "Who cooks?", reveal: "open" }, now: t0 });
    expect(q.phase).toBe("open");
    await respond(db, { roundId: q.id, userId: people[1], input: { text: "me" }, now: t0 });
    expect((await roundView(db, q.id, eve, t0)).responses).toHaveLength(1);

    await db.execute(`update communities set members_post_open_questions = false`);
    await expect(postOpenQuestion(db, { communityId: community.id, userId: eve, prompt: { question: "Again?" } })).rejects.toThrow(/hosts/);
  });

  it("keeps the welcome question open", async () => {
    await updateWelcomeNote(db, { communityId: community.id, userId: "u_host", note: "hi" });
    await setWelcomeQuestion(db, { communityId: community.id, userId: "u_host", question: "What brought you?" });
    const [w] = await db.select().from(rounds).where(eq(rounds.welcome, true));
    await expect(revealNow(db, { roundId: w.id, userId: "u_host" })).rejects.toThrow(/stays open/);
  });
});
