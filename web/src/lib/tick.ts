import "server-only";

import { db } from "@/db";
import { runClock } from "@/domain/clock";
import { deepgram } from "./deepgram";
import { sendMail } from "./email";

export function tick(now = new Date()) {
  return runClock(db, sendMail, now, deepgram());
}
