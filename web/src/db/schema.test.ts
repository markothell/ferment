import { beforeEach, describe, expect, it } from "vitest";
import { newId } from "@/lib/id";
import type { DB } from "./index";
import { circleMembers, circles, communities, prompts, responses, rounds, user } from "./schema";
import { testDb } from "./testing";

let db: DB;
let communityId: string;
let promptId: string;
const alice = "u_alice";

beforeEach(async () => {
  db = await testDb();
  await db.insert(user).values({ id: alice, name: "Alice", email: "alice@example.com" });
  communityId = newId();
  await db.insert(communities).values({ id: communityId, slug: "tables", name: "Tables", createdBy: alice });
  promptId = newId();
  await db.insert(prompts).values({ id: promptId, communityId, authorId: alice, question: "What fed you this week?", shape: "story" });
});

async function circle() {
  const id = newId();
  await db.insert(circles).values({ id, communityId, slug: id, name: "Tuesday", proposedBy: alice });
  return id;
}

describe("schema constraints", () => {
  it("applies the migration with its defaults", async () => {
    const [c] = await db.select().from(communities);
    expect(c.proposalExpiryDays).toBe(7);
    expect(c.membersPostOpenQuestions).toBe(true);
    expect(c.maxMembers).toBe(100);
  });

  it("allows one response per member per round", async () => {
    const roundId = newId();
    await db.insert(rounds).values({ id: roundId, promptId, communityId, authorId: alice, phase: "open" });
    await db.insert(responses).values({ id: newId(), roundId, userId: alice, text: "bread" });
    await expect(
      db.insert(responses).values({ id: newId(), roundId, userId: alice, text: "again" }),
    ).rejects.toThrow();
  });

  it("allows one membership per person per circle", async () => {
    const circleId = await circle();
    await db.insert(circleMembers).values({ circleId, userId: alice });
    await expect(db.insert(circleMembers).values({ circleId, userId: alice })).rejects.toThrow();
  });

  it("keeps the welcome question community-wide and single", async () => {
    const circleId = await circle();
    await expect(
      db.insert(rounds).values({ id: newId(), promptId, communityId, circleId, authorId: alice, phase: "open", welcome: true }),
    ).rejects.toThrow();

    await db.insert(rounds).values({ id: newId(), promptId, communityId, authorId: alice, phase: "open", welcome: true });
    await expect(
      db.insert(rounds).values({ id: newId(), promptId, communityId, authorId: alice, phase: "open", welcome: true }),
    ).rejects.toThrow();
  });

  it("keeps placements on the unit square", async () => {
    const roundId = newId();
    await db.insert(rounds).values({ id: roundId, promptId, communityId, authorId: alice, phase: "open" });
    await expect(
      db.insert(responses).values({ id: newId(), roundId, userId: alice, x: 1.5 }),
    ).rejects.toThrow();
  });
});
