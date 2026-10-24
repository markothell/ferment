import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DB } from "@/db";
import { groups, notifications, prompts, roundSupports, rounds, starters, user, words, type StarterContent } from "@/db/schema";
import { testDb } from "@/db/testing";
import { curatedFiles } from "@/lib/curated";
import { createCircle, joinCircle } from "./circles";
import { Refusal } from "./errors";
import { createGathering, STARTS_PER_DAY, type Gathering } from "./gatherings";
import { acceptInvite, createInvite } from "./invites";
import { suggestReply } from "./replies";
import { postOpenQuestion, respond, revealNow, suggestRound } from "./rounds";
import {
  addStarter, checkCurated, copyStarter, deleteStarter, describeStarter, library, loadCurated, myStarters,
  normalizeStarterContent, saveStarter, setPublished, starterBySlug, starterLineage, startFromStarter,
  type Starter,
} from "./starters";

let db: DB;
const t0 = new Date("2026-10-19T12:00:00Z");
const hours = (n: number) => new Date(t0.getTime() + n * 3_600_000);
const host = { id: "u_host", email: "host@example.com" };
const curator = { id: "u_cur", email: "curator@example.com" };
const amy = { id: "u_amy", email: "amy@example.com" };

async function person(p: { id: string; email: string }) {
  await db.insert(user).values({ id: p.id, name: p.email.split("@")[0], email: p.email });
}

async function memberOf(gathering: Gathering, name: string) {
  const id = `u_${name}`;
  await db.insert(user).values({ id, name, email: `${name}@example.com` });
  const token = (await createInvite(db, { gatheringId: gathering.id, invitedBy: gathering.createdBy, email: `${name}@example.com`, now: t0 })).token!;
  await acceptInvite(db, { token, userId: id, userEmail: `${name}@example.com`, now: t0 });
  return id;
}

const q = (question: string, extra: Partial<StarterContent["openQuestions"][number]> = {}) => ({ key: question.slice(0, 12), question, ...extra });

/** A small design: a welcome question, two circles, a words question to everyone. */
const DESIGN = {
  welcomeNote: "We're here to think about bread.",
  welcomeQuestion: { key: "welcome", question: "What bread did you grow up with?" },
  circles: [
    {
      key: "c1", name: "Starters", color: "moss",
      questions: [
        { key: "s1", question: "What did you bake first?" },
        { key: "s2", question: "How sure are you of your loaf?", shape: "placement", axes: [{ poleA: "Not at all", poleB: "Very" }] },
        { key: "s3", question: "What would you teach?", telling: "text", timerHours: 72 },
      ],
    },
    { key: "c2", name: "Ovens", questions: [{ key: "o1", question: "Whose oven?" }] },
  ],
  openQuestions: [{ key: "w1", question: "Which words go with bread?", shape: "words", seedWords: ["crust", "crumb", "rise"] }],
};

async function published(design = DESIGN, slug = "bread"): Promise<Starter> {
  await loadCurated(db, [{ slug, title: "Bread, together", summary: "A starter about bread.", content: design }], t0);
  return (await starterBySlug(db, slug))!;
}

beforeEach(async () => {
  db = await testDb();
  process.env.FERMENT_HOST_EMAILS = curator.email;
  for (const p of [host, curator, amy]) await person(p);
});
afterEach(() => { delete process.env.FERMENT_HOST_EMAILS; });

describe("the design", () => {
  it("passes every question through the prompt rules and fills defaults", () => {
    const c = normalizeStarterContent(DESIGN);
    expect(c.circles[0].questions[0]).toMatchObject({ key: "s1", shape: "story", telling: "voice", reveal: "sealed", secondsPerNote: 60, timerHours: null });
    expect(c.circles[0].questions[1]).toMatchObject({ shape: "placement", placing: "free", telling: null });
    expect(c.circles[1].color).toBe("saffron");
    expect(c.openQuestions[0]).toMatchObject({ pickMax: 5, coinMax: 2, seedWords: ["crust", "crumb", "rise"] });
    expect(() => normalizeStarterContent({ circles: [{ name: "x", questions: [{ question: "q", shape: "placement" }] }] })).toThrow(Refusal);
    expect(() => normalizeStarterContent({ circles: [{ name: "", questions: [] }] })).toThrow(/name/);
  });

  it("gives every question its own key, and our files must write theirs", () => {
    const c = normalizeStarterContent({ openQuestions: [q("One"), { key: "One", question: "Two" }, { question: "Three" }] });
    expect(new Set(c.openQuestions.map((x) => x.key)).size).toBe(3);
    expect(() => checkCurated({ slug: "x", title: "X", content: { openQuestions: [{ question: "No key" }] } })).toThrow(/key/);
    expect(() => checkCurated({ slug: "Not A Slug", title: "X", content: {} })).toThrow(/slug/);
    expect(() => checkCurated({ slug: "mine", title: "X", content: {} })).toThrow(/slug/);
  });

  it("keeps our own starter files valid", () => {
    const files = curatedFiles();
    expect(files.length).toBeGreaterThan(0);
    const slugs = files.map((f) => checkCurated(f).slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe("starting a gathering from a starter", () => {
  it("proposes each circle with its first question queued and the rest suggested, in order", async () => {
    const s = await published();
    const g = await startFromStarter(db, { starterId: s.id, viewer: host, name: "Our bread", now: t0 });
    expect(g).toMatchObject({ starterId: s.id, note: DESIGN.welcomeNote, createdBy: host.id });

    const cs = await db.select().from(groups).where(eq(groups.parentId, g.id)).orderBy(groups.createdAt);
    expect(cs.map((c) => [c.name, c.status, c.hostId, c.color])).toEqual([["Starters", "forming", host.id, "moss"], ["Ovens", "forming", host.id, "saffron"]]);
    const starter = cs.find((c) => c.name === "Starters")!;
    const rs = await db
      .select({ id: rounds.id, phase: rounds.phase, question: prompts.question, timer: rounds.timerHours, key: prompts.starterKey, from: prompts.starterId })
      .from(rounds).innerJoin(prompts, eq(prompts.id, rounds.promptId))
      .where(eq(rounds.groupId, starter.id)).orderBy(rounds.createdAt);
    expect(rs.map((r) => [r.question, r.phase, r.timer, r.key, r.from])).toEqual([
      ["What did you bake first?", "queued", null, "s1", s.id],
      ["How sure are you of your loaf?", "nominated", null, "s2", s.id],
      ["What would you teach?", "nominated", 72, "s3", s.id],
    ]);
    expect(await db.select().from(roundSupports).where(eq(roundSupports.roundId, rs[1].id))).toHaveLength(1);

    // The circle still paces itself: forming opens the first question and nothing else.
    for (const n of ["ben", "cal", "dee"]) await joinCircle(db, { circleId: starter.id, userId: await memberOf(g, n), now: hours(1) });
    const phases = await db.select({ phase: rounds.phase }).from(rounds).where(eq(rounds.groupId, starter.id)).orderBy(rounds.createdAt);
    expect(phases.map((p) => p.phase)).toEqual(["open", "nominated", "nominated"]);
  });

  it("opens the welcome question and the questions to everyone, words and all", async () => {
    const s = await published();
    const g = await startFromStarter(db, { starterId: s.id, viewer: host, name: "Our bread", welcomeNote: "Our own note.", now: t0 });
    expect(g.note).toBe("Our own note.");
    const open = await db
      .select({ welcome: rounds.welcome, phase: rounds.phase, question: prompts.question })
      .from(rounds).innerJoin(prompts, eq(prompts.id, rounds.promptId))
      .where(and(eq(rounds.rootId, g.id), eq(rounds.phase, "open")));
    expect(open.map((r) => [r.question, r.welcome])).toEqual(
      expect.arrayContaining([["What bread did you grow up with?", true], ["Which words go with bread?", false]]),
    );
    const everyone = (await db.select().from(rounds).where(and(eq(rounds.rootId, g.id), eq(rounds.welcome, false), eq(rounds.phase, "open"))))[0];
    expect((await db.select().from(words).where(eq(words.roundId, everyone.id))).map((w) => w.label).sort()).toEqual(["crumb", "crust", "rise"]);
  });

  it("is for starters you can see, and is capped per person per day", async () => {
    const s = await published();
    const g = await startFromStarter(db, { starterId: s.id, viewer: host, name: "Mine", now: t0 });
    const mine = await saveStarter(db, { gatheringId: g.id, userId: host.id, title: "Private bread", now: t0 });
    await expect(startFromStarter(db, { starterId: mine.id, viewer: amy, name: "Hers", now: t0 })).rejects.toThrow(/isn't here/);

    for (let i = 1; i < STARTS_PER_DAY; i++) await createGathering(db, { userId: host.id, name: `G${i}`, now: hours(i) });
    await expect(createGathering(db, { userId: host.id, name: "One more", now: hours(6) })).rejects.toThrow(/today/);
    await expect(createGathering(db, { userId: host.id, name: "Next day", now: hours(25) })).resolves.toBeTruthy();
  });
});

describe("saving a gathering as a starter", () => {
  it("keeps the design in the order the circle met it, and leaves people, answers and follow-ups behind", async () => {
    const g = await createGathering(db, { userId: host.id, name: "Tables", welcomeNote: "Hello.", now: t0 });
    const c = await createCircle(db, { gatheringId: g.id, userId: host.id, name: "Soup", firstQuestion: "What soup do you make?", now: t0 });
    const ids = [];
    for (const n of ["ben", "cal", "dee"]) { const id = await memberOf(g, n); ids.push(id); await joinCircle(db, { circleId: c.id, userId: id, now: t0 }); }
    const first = (await db.select().from(rounds).where(eq(rounds.groupId, c.id)))[0];
    await respond(db, { roundId: first.id, userId: ids[0], input: { text: "Leek and potato." }, now: hours(1) });
    await revealNow(db, { roundId: first.id, userId: host.id, now: hours(2) });
    await suggestReply(db, { roundId: first.id, userId: host.id, prompt: { question: "Whose leek soup?" }, now: hours(3) });
    await suggestRound(db, { circleId: c.id, userId: ids[1], prompt: { question: "Hot or cold?", shape: "placement", axes: [{ poleA: "Hot", poleB: "Cold" }] }, timerHours: 24, now: hours(4) });
    await postOpenQuestion(db, { gatheringId: g.id, userId: host.id, prompt: { question: "Best soup in town?" }, now: hours(5) });

    const s = await saveStarter(db, { gatheringId: g.id, userId: host.id, title: "  Soup  nights ", summary: "Talk over soup.", now: hours(6) });
    expect(s).toMatchObject({ title: "Soup nights", slug: "soup-nights", visibility: "private", authorId: host.id, forkedFromId: null, madeFromGroupId: g.id });
    expect(s.content.welcomeNote).toBe("Hello.");
    expect(s.content.circles.map((k) => [k.name, k.questions.map((x) => [x.question, x.timerHours])])).toEqual([
      ["Soup", [["What soup do you make?", null], ["Hot or cold?", 24]]],
    ]);
    expect(s.content.openQuestions.map((x) => x.question)).toEqual(["Best soup in town?"]);
    expect(JSON.stringify(s.content)).not.toMatch(/Leek and potato|Whose leek|u_ben/);
  });

  it("is for hosts, and needs something to save", async () => {
    const g = await createGathering(db, { userId: host.id, name: "Empty", now: t0 });
    await expect(saveStarter(db, { gatheringId: g.id, userId: host.id, title: "Nothing" })).rejects.toThrow(/nothing to save/);
    const ben = await memberOf(g, "ben");
    await expect(saveStarter(db, { gatheringId: g.id, userId: ben, title: "Mine" })).rejects.toThrow(/host/);
  });

  it("records lineage: a copy of the starter it came from, each question from the one it grew out of", async () => {
    const s = await published();
    const g = await startFromStarter(db, { starterId: s.id, viewer: host, name: "Our bread", now: t0 });
    const circle = (await db.select().from(groups).where(and(eq(groups.parentId, g.id), eq(groups.name, "Ovens"))))[0];
    await suggestRound(db, { circleId: circle.id, userId: host.id, prompt: { question: "A new one of ours" }, now: hours(1) });

    const fork = await saveStarter(db, { gatheringId: g.id, userId: host.id, title: "Our bread", now: hours(2) });
    expect(fork).toMatchObject({ forkedFromId: s.id, forkedFromTitle: "Bread, together" });
    const ovens = fork.content.circles.find((c) => c.name === "Ovens")!;
    expect(ovens.questions.map((x) => x.from)).toEqual([{ starterId: s.id, key: "o1" }, null]);
    expect(fork.content.welcomeQuestion?.from).toEqual({ starterId: s.id, key: "welcome" });

    // Saving over it keeps its own keys, and what they came from.
    await db.update(groups).set({ note: "Changed." }).where(eq(groups.id, g.id));
    const updated = await saveStarter(db, { gatheringId: g.id, userId: host.id, title: "Our bread, v2", replaceId: fork.id, now: hours(5) });
    expect(updated.id).toBe(fork.id);
    expect(updated.content.welcomeNote).toBe("Changed.");
    expect(updated.content.circles.find((c) => c.name === "Ovens")!.questions.map((x) => [x.key, x.from])).toEqual(
      ovens.questions.map((x) => [x.key, x.from]),
    );
    expect(updated.content.welcomeQuestion?.key).toBe(fork.content.welcomeQuestion?.key);

    // A gathering started from the copy: its questions come from the copy's keys.
    const g2 = await startFromStarter(db, { starterId: fork.id, viewer: host, name: "Bread again", now: hours(6) });
    const again = await saveStarter(db, { gatheringId: g2.id, userId: host.id, title: "Bread again", now: hours(7) });
    expect(again.forkedFromId).toBe(fork.id);
    expect(again.content.circles.find((c) => c.name === "Ovens")!.questions[1].from).toEqual({ starterId: fork.id, key: ovens.questions[1].key });
    await expect(saveStarter(db, { gatheringId: g2.id, userId: host.id, title: "x", replaceId: fork.id })).rejects.toThrow(/saved from this gathering/);
  });
});

describe("copies, the library, and lineage", () => {
  it("copies what you can see onto your shelf, each question from its original", async () => {
    const s = await published();
    const c = await copyStarter(db, { starterId: s.id, viewer: amy, now: t0 });
    expect(c).toMatchObject({ authorId: amy.id, visibility: "private", forkedFromId: s.id, title: "Bread, together", slug: "bread-together" });
    expect(c.content.circles[0].questions[0].from).toEqual({ starterId: s.id, key: "s1" });
    expect((await myStarters(db, amy.id)).map((x) => x.slug)).toEqual(["bread-together"]);
    await expect(copyStarter(db, { starterId: c.id, viewer: host })).rejects.toThrow(/isn't here/);
    expect((await copyStarter(db, { starterId: c.id, viewer: amy })).title).toBe("Bread, together (copy)");
  });

  it("lets only curators publish, their own, and take any down", async () => {
    const s = await published();
    const mine = await copyStarter(db, { starterId: s.id, viewer: amy });
    await expect(setPublished(db, { starterId: mine.id, viewer: amy, published: true })).rejects.toThrow(/curators/);
    await expect(setPublished(db, { starterId: mine.id, viewer: curator, published: true })).rejects.toThrow(/Copy this one/);

    const theirs = await copyStarter(db, { starterId: s.id, viewer: curator });
    await describeStarter(db, { starterId: theirs.id, userId: curator.id, title: "Bread for beginners", summary: "Gentler." });
    await expect(describeStarter(db, { starterId: theirs.id, userId: amy.id, title: "Mine now", summary: "" })).rejects.toThrow(/Only whoever/);
    await setPublished(db, { starterId: theirs.id, viewer: curator, published: true, now: hours(1) });
    expect((await library(db)).map((x) => [x.title, x.fromFerment, x.by])).toEqual([
      ["Bread, together", true, "ferment"], ["Bread for beginners", false, "curator"],
    ]);
    await setPublished(db, { starterId: s.id, viewer: curator, published: false });
    expect((await library(db)).map((x) => x.title)).toEqual(["Bread for beginners"]);
  });

  it("shows where a starter came from and went, naming only what the viewer may see", async () => {
    const s = await published();
    const a = await copyStarter(db, { starterId: s.id, viewer: amy });
    const c = await copyStarter(db, { starterId: s.id, viewer: curator });
    await setPublished(db, { starterId: c.id, viewer: curator, published: true });
    await startFromStarter(db, { starterId: s.id, viewer: host, name: "One", now: t0 });
    await startFromStarter(db, { starterId: s.id, viewer: amy, name: "Two", now: t0 });

    const seen = await starterLineage(db, s, host);
    expect(seen).toMatchObject({ by: "ferment", ancestors: [], otherCopies: 1, started: 2, opened: 4 });
    expect(seen.copies.map((x) => x.by)).toEqual(["curator"]);
    expect((await starterLineage(db, s, amy)).copies.map((x) => [x.by, x.mine])).toEqual([["amy", true], ["curator", false]]);
    expect((await starterLineage(db, a, amy)).ancestors).toEqual([{ slug: "bread", title: "Bread, together", by: "ferment" }]);

    // Taken down: the copy says only that it came from a private starter.
    await setPublished(db, { starterId: s.id, viewer: curator, published: false });
    expect((await starterLineage(db, a, amy)).ancestors).toEqual([{ slug: null, title: "a private starter", by: "" }]);
  });

  it("deletes your own, off the library, and its copies keep its title", async () => {
    const s = await published();
    const a = await copyStarter(db, { starterId: s.id, viewer: amy });
    const b = await copyStarter(db, { starterId: a.id, viewer: amy });
    await expect(deleteStarter(db, { starterId: a.id, userId: host.id })).rejects.toThrow(/Only whoever/);
    await deleteStarter(db, { starterId: a.id, userId: amy.id });
    const left = (await db.select().from(starters).where(eq(starters.id, b.id)))[0];
    expect(left).toMatchObject({ forkedFromId: null, forkedFromTitle: "Bread, together" });
    expect((await starterLineage(db, left, amy)).ancestors).toEqual([{ slug: null, title: "Bread, together (no longer here)", by: "" }]);

    const theirs = await copyStarter(db, { starterId: s.id, viewer: curator });
    await setPublished(db, { starterId: theirs.id, viewer: curator, published: true });
    await expect(deleteStarter(db, { starterId: theirs.id, userId: curator.id })).rejects.toThrow(/Take it out/);
  });
});

describe("adding a starter to a gathering", () => {
  it("adds its circles and questions, fills the welcome only where empty, and tells everyone", async () => {
    const s = await published();
    const g = await createGathering(db, { userId: host.id, name: "Tables", welcomeNote: "Ours.", now: t0 });
    await createCircle(db, { gatheringId: g.id, userId: host.id, name: "Starters", now: t0 });
    const ben = await memberOf(g, "ben");
    await expect(addStarter(db, { gatheringId: g.id, starterId: s.id, viewer: { id: ben, email: "ben@example.com" } })).rejects.toThrow(/host/);

    await addStarter(db, { gatheringId: g.id, starterId: s.id, viewer: host, now: hours(1) });
    const after = (await db.select().from(groups).where(eq(groups.id, g.id)))[0];
    expect(after).toMatchObject({ note: "Ours.", starterId: s.id });
    const names = (await db.select({ slug: groups.slug }).from(groups).where(eq(groups.parentId, g.id))).map((c) => c.slug).sort();
    expect(names).toEqual(["ovens", "starters", "starters-2"]);
    const welcome = await db.select().from(rounds).where(and(eq(rounds.rootId, g.id), eq(rounds.welcome, true)));
    expect(welcome).toHaveLength(1);
    const told = await db.select().from(notifications).where(and(eq(notifications.userId, ben), eq(notifications.kind, "asked_everyone")));
    expect(told).toHaveLength(1);
  });
});
