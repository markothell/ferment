import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { DB } from "@/db";
import { contactMessages } from "@/db/schema";
import { testDb } from "@/db/testing";
import { contactInbox, sendContact, type ContactMail } from "./contact";

let db: DB;
let sent: ContactMail[];
const send = async (m: ContactMail) => { sent.push(m); };
const t0 = new Date("2026-10-01T12:00:00Z");

beforeEach(async () => {
  db = await testDb();
  sent = [];
});

describe("contact", () => {
  it("saves the message, then emails it with the writer as reply-to", async () => {
    const { id, delivery } = await sendContact(db, { name: " Ada ", email: "Ada@Example.com", message: " hello ", now: t0 }, send, "me@example.com");
    expect(delivery).toBe("sent");
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: "me@example.com", replyTo: "ada@example.com", subject: "ferment contact: Ada" });
    expect(sent[0].text).toContain("hello");
    const [row] = await db.select().from(contactMessages).where(eq(contactMessages.id, id));
    expect(row).toMatchObject({ name: "Ada", email: "ada@example.com", message: "hello", delivery: "sent" });
  });

  it("keeps the message when the email fails", async () => {
    const fail = async () => { throw new Error("down"); };
    const { id, delivery } = await sendContact(db, { name: "", email: "a@example.com", message: "hi", now: t0 }, fail, "me@example.com");
    expect(delivery).toBe("failed");
    const [row] = await db.select().from(contactMessages).where(eq(contactMessages.id, id));
    expect(row.delivery).toBe("failed");
  });

  it("refuses a bad address or an empty message", async () => {
    await expect(sendContact(db, { name: "", email: "nope", message: "hi" }, send, "me@example.com")).rejects.toThrow(/email address/);
    await expect(sendContact(db, { name: "", email: "a@example.com", message: "  " }, send, "me@example.com")).rejects.toThrow(/say/);
    expect(sent).toHaveLength(0);
  });

  it("caps an address at five an hour", async () => {
    for (let i = 0; i < 5; i++) await sendContact(db, { name: "", email: "a@example.com", message: `m${i}`, now: t0 }, send, "me@example.com");
    await expect(sendContact(db, { name: "", email: "a@example.com", message: "m5", now: t0 }, send, "me@example.com")).rejects.toThrow(/later/);
    const later = new Date(t0.getTime() + 61 * 60_000);
    await expect(sendContact(db, { name: "", email: "a@example.com", message: "m6", now: later }, send, "me@example.com")).resolves.toBeTruthy();
  });

  it("goes to FERMENT_CONTACT_EMAIL, else the first host", () => {
    expect(contactInbox({ FERMENT_CONTACT_EMAIL: "c@example.com", FERMENT_HOST_EMAILS: "h@example.com" })).toBe("c@example.com");
    expect(contactInbox({ FERMENT_HOST_EMAILS: "H@example.com, other@example.com" })).toBe("h@example.com");
    expect(contactInbox({})).toBeNull();
  });
});
