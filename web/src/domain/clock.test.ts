import { beforeEach, describe, expect, it } from "vitest";
import type { DB } from "@/db";
import { user } from "@/db/schema";
import { testDb } from "@/db/testing";
import type { Mail } from "@/lib/email";
import { createCircle, seatInCircle } from "./circles";
import { runClock } from "./clock";
import { createCommunity } from "./communities";
import { acceptInvite, createInvite } from "./invites";
import { roundById, suggestRound, toggleSupport } from "./rounds";

let db: DB;
let sent: Mail[];
const send = async (m: Mail) => { sent.push(m); };
const t0 = new Date("2026-10-01T12:00:00Z");
const hours = (n: number) => new Date(t0.getTime() + n * 3_600_000);

beforeEach(async () => {
  db = await testDb();
  sent = [];
  process.env.FERMENT_HOST_EMAILS = "host@example.com";
  await db.insert(user).values({ id: "u_host", name: "Host", email: "host@example.com" });
});

async function setup() {
  const community = await createCommunity(db, { userId: "u_host", userEmail: "host@example.com", name: "Tables" });
  const circle = await createCircle(db, { communityId: community.id, userId: "u_host", name: "Bread", firstQuestion: "What fed you?", now: t0 });
  for (const n of ["amy", "ben", "cal"]) {
    await db.insert(user).values({ id: `u_${n}`, name: n, email: `${n}@example.com` });
    const token = (await createInvite(db, { communityId: community.id, invitedBy: "u_host", email: `${n}@example.com`, now: t0 })).token!;
    await acceptInvite(db, { token, userId: `u_${n}`, userEmail: `${n}@example.com`, now: t0 });
    await seatInCircle(db, { circleId: circle.id, userId: `u_${n}`, now: t0 });
  }
  return { community, circle };
}

describe("the clock", () => {
  it("closes a round when its timer runs out and emails the reveal", async () => {
    const { circle } = await setup();
    const r = await suggestRound(db, { circleId: circle.id, userId: "u_amy", prompt: { question: "A meal?" }, timerHours: 24, now: hours(1) });
    await toggleSupport(db, { roundId: r.id, userId: "u_ben", now: hours(1) });
    await runClock(db, send, hours(2));
    sent = [];
    await runClock(db, send, hours(26));
    expect((await roundById(db, r.id))!.closedVia).toBe("timer");
    const toCal = sent.find((m) => m.to === "cal@example.com")!;
    expect(toCal.subject).toBe("Everyone's answers to “A meal?” are in, in Bread");
    expect(toCal.text).toContain("/r/");
  });

  it("gathers a burst into one email, and doesn't send it twice", async () => {
    await setup();
    await runClock(db, send, hours(1));
    const toAmy = sent.filter((m) => m.to === "amy@example.com");
    expect(toAmy).toHaveLength(1);
    expect(toAmy[0].subject).toBe("2 new in Tables");
    sent = [];
    await runClock(db, send, hours(2));
    expect(sent.filter((m) => m.to === "amy@example.com")).toHaveLength(0);
  });

  it("lapses proposals that never filled", async () => {
    const community = await createCommunity(db, { userId: "u_host", userEmail: "host@example.com", name: "Quiet" });
    await createCircle(db, { communityId: community.id, userId: "u_host", name: "Alone", now: t0 });
    expect((await runClock(db, send, hours(24 * 8))).expired).toBe(1);
  });
});
