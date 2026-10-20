import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { DB } from "@/db";
import { responses, user } from "@/db/schema";
import { testDb } from "@/db/testing";
import { runClock } from "./clock";
import { createGathering } from "./gatherings";
import { postOpenQuestion, respond, roundView } from "./rounds";
import { TryLater, transcribePending, transcribeResponse, type Transcriber } from "./transcripts";

let db: DB;
let roundId: string;
let heard: string[];
const t0 = new Date("2026-10-01T12:00:00Z");
const minutes = (n: number) => new Date(t0.getTime() + n * 60_000);
const says = (text: string): Transcriber => async (url) => { heard.push(url); return text; };
const status = async (id: string) => (await db.select().from(responses).where(eq(responses.id, id)))[0];

beforeEach(async () => {
  db = await testDb();
  heard = [];
  process.env.FERMENT_HOST_EMAILS = "host@example.com";
  await db.insert(user).values({ id: "u_host", name: "Host", email: "host@example.com" });
  const gathering = await createGathering(db, { userId: "u_host", name: "Tables" });
  roundId = (await postOpenQuestion(db, { gatheringId: gathering.id, userId: "u_host", prompt: { question: "What fed you?", reveal: "open" }, now: t0 })).id;
});

const record = (url = "/api/audio/local/take1.m4a", now = t0) =>
  respond(db, { roundId, userId: "u_host", input: { audioUrl: url, audioSeconds: 20 }, now });

describe("transcripts", () => {
  it("waits on a new recording and fills it in, shown with the answer", async () => {
    const id = await record();
    expect((await status(id)).transcriptStatus).toBe("pending");
    expect(await transcribeResponse(db, says(" Bread, mostly. "), id)).toBe("ready");
    expect(await status(id)).toMatchObject({ transcriptStatus: "ready", transcript: "Bread, mostly." });
    const [shown] = (await roundView(db, roundId, "u_host", t0)).responses;
    expect(shown).toMatchObject({ transcript: "Bread, mostly.", transcriptStatus: "ready" });
  });

  it("leaves written answers alone", async () => {
    const id = await respond(db, { roundId, userId: "u_host", input: { text: "Soup." }, now: t0 });
    expect((await status(id)).transcriptStatus).toBe("none");
    expect(await transcribeResponse(db, says("x"), id)).toBe("skipped");
    expect(heard).toEqual([]);
  });

  it("never transcribes the same recording twice", async () => {
    const id = await record();
    await transcribeResponse(db, says("one"), id);
    expect(await transcribeResponse(db, says("two"), id)).toBe("skipped");
    await respond(db, { roundId, userId: "u_host", input: { text: "and a note" }, now: t0 });
    expect(await status(id)).toMatchObject({ transcriptStatus: "ready", transcript: "one" });
  });

  it("tries again later when the service is down, and gives up when it refuses", async () => {
    const id = await record();
    expect(await transcribeResponse(db, async () => { throw new TryLater("503"); }, id)).toBe("later");
    expect((await status(id)).transcriptStatus).toBe("pending");
    expect(await transcribeResponse(db, async () => { throw new Error("400"); }, id)).toBe("failed");
    expect((await status(id)).transcriptStatus).toBe("failed");
  });

  it("the clock picks up what's still pending, after giving the share action its turn", async () => {
    await record("/api/audio/local/take1.m4a", t0);
    expect(await transcribePending(db, says("hi"), minutes(1))).toBe(0);
    expect(await transcribePending(db, says("hi"), minutes(3))).toBe(1);
    expect(heard).toEqual(["/api/audio/local/take1.m4a"]);
  });

  it("runs as part of the clock when there's a transcriber", async () => {
    await record();
    const send = async () => {};
    expect((await runClock(db, send, minutes(3))).transcribed).toBe(0);
    expect((await runClock(db, send, minutes(3), says("hi"))).transcribed).toBe(1);
  });
});
