import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { newId } from "@/lib/id";
import type { DB } from "./index";
import { groups, members, prompts, responses, rounds, user } from "./schema";
import { testDb } from "./testing";

let db: DB;
let gatheringId: string;
let promptId: string;
const alice = "u_alice";

beforeEach(async () => {
  db = await testDb();
  await db.insert(user).values({ id: alice, name: "Alice", email: "alice@example.com" });
  gatheringId = newId();
  await db.insert(groups).values({ id: gatheringId, slug: "tables", kind: "gathering", rootId: gatheringId, name: "Tables", createdBy: alice });
  promptId = newId();
  await db.insert(prompts).values({ id: promptId, rootId: gatheringId, authorId: alice, question: "What fed you this week?", shape: "story" });
});

async function circle() {
  const id = newId();
  await db.insert(groups).values({ id, kind: "circle", parentId: gatheringId, rootId: gatheringId, slug: id, name: "Tuesday", createdBy: alice });
  return id;
}

describe("schema constraints", () => {
  it("applies the migration with its defaults", async () => {
    const [c] = await db.select().from(groups);
    expect(c.proposalExpiryDays).toBe(7);
    expect(c.membersPostOpenQuestions).toBe(true);
    expect(c.maxMembers).toBe(100);
  });

  it("allows one response per member per round", async () => {
    const roundId = newId();
    await db.insert(rounds).values({ id: roundId, promptId, groupId: gatheringId, rootId: gatheringId, authorId: alice, phase: "open" });
    await db.insert(responses).values({ id: newId(), roundId, userId: alice, text: "bread" });
    await expect(
      db.insert(responses).values({ id: newId(), roundId, userId: alice, text: "again" }),
    ).rejects.toThrow();
  });

  it("allows one membership per person per group", async () => {
    const circleId = await circle();
    await db.insert(members).values({ groupId: circleId, userId: alice });
    await expect(db.insert(members).values({ groupId: circleId, userId: alice })).rejects.toThrow();
  });

  it("keeps a root its own root, and a child someone else's", async () => {
    await expect(db.insert(groups).values({ id: "g2", slug: "g2", kind: "gathering", rootId: gatheringId, name: "Two", createdBy: alice })).rejects.toThrow();
    await expect(db.insert(groups).values({ id: "c2", slug: "c2", kind: "circle", parentId: gatheringId, rootId: "c2", name: "Two", createdBy: alice })).rejects.toThrow();
  });

  it("lets the pinned question go when its round does", async () => {
    const roundId = newId();
    await db.insert(rounds).values({ id: roundId, promptId, groupId: gatheringId, rootId: gatheringId, authorId: alice, phase: "open" });
    await db.update(groups).set({ pinnedRoundId: roundId }).where(eq(groups.id, gatheringId));
    await db.delete(rounds).where(eq(rounds.id, roundId));
    const [g] = await db.select().from(groups).where(eq(groups.id, gatheringId));
    expect(g.pinnedRoundId).toBeNull();
  });

  it("keeps placements on the unit square", async () => {
    const roundId = newId();
    await db.insert(rounds).values({ id: roundId, promptId, groupId: gatheringId, rootId: gatheringId, authorId: alice, phase: "open" });
    await expect(
      db.insert(responses).values({ id: newId(), roundId, userId: alice, x: 1.5 }),
    ).rejects.toThrow();
  });
});
