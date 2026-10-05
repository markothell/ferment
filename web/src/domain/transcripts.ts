// Transcripts for voice answers (PLAN §9). A recording is saved as `pending`;
// right after the answer is shared the server asks for its text, and the clock
// picks up anything still pending later. A transcript lets the wall be read as
// well as played. It never gates anything: the recording plays without it.
//
// Takes the transcriber as an argument, like the clock takes the mail sender,
// so tests pass their own (lib/deepgram.ts is the real one).

import { and, asc, eq, lte } from "drizzle-orm";
import type { DB } from "@/db";
import { responses } from "@/db/schema";
import { refreshHarvestItem } from "./harvests";

export type Transcriber = (audioUrl: string) => Promise<string>;

/** Thrown by a transcriber when trying again later might work (network, 5xx, rate limit). */
export class TryLater extends Error {}

// The share action starts transcribing straight away; the clock leaves a fresh
// recording to it so the same audio isn't sent twice.
const CLOCK_GRACE_MS = 2 * 60_000;
const CLOCK_BATCH = 10;

/** Transcribe one pending answer. Never throws: the answer is saved either way. */
export async function transcribeResponse(db: DB, transcribe: Transcriber, responseId: string): Promise<"ready" | "failed" | "later" | "skipped"> {
  const [r] = await db
    .select({ audioUrl: responses.audioUrl, status: responses.transcriptStatus, roundId: responses.roundId, userId: responses.userId })
    .from(responses)
    .where(eq(responses.id, responseId))
    .limit(1);
  if (!r?.audioUrl || r.status !== "pending") return "skipped";
  try {
    const transcript = (await transcribe(r.audioUrl)).trim();
    // Pending → ready only, so a slower duplicate can't overwrite a finished one.
    await db
      .update(responses)
      .set({ transcript, transcriptStatus: "ready" })
      .where(and(eq(responses.id, responseId), eq(responses.transcriptStatus, "pending")));
    // Already shared into a harvest? It gets the transcript too.
    await refreshHarvestItem(db, { roundId: r.roundId, userId: r.userId });
    return "ready";
  } catch (e) {
    console.error(`[transcripts] ${responseId}:`, e instanceof Error ? e.message : e);
    if (e instanceof TryLater) return "later";
    await db
      .update(responses)
      .set({ transcriptStatus: "failed" })
      .where(and(eq(responses.id, responseId), eq(responses.transcriptStatus, "pending")));
    return "failed";
  }
}

/** The clock's share: answers still pending a little while after they were shared. */
export async function transcribePending(db: DB, transcribe: Transcriber, now = new Date()): Promise<number> {
  const due = await db
    .select({ id: responses.id })
    .from(responses)
    .where(and(eq(responses.transcriptStatus, "pending"), lte(responses.updatedAt, new Date(now.getTime() - CLOCK_GRACE_MS))))
    .orderBy(asc(responses.createdAt))
    .limit(CLOCK_BATCH);
  let done = 0;
  for (const { id } of due) if ((await transcribeResponse(db, transcribe, id)) === "ready") done++;
  return done;
}
