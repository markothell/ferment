"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { circleById, createCircle, joinCircle, leaveCircle, promoteCircle, setCircleColor, type Circle } from "@/domain/circles";
import { pinQuestion, setArchived, updateWelcomeNote } from "@/domain/gatherings";
import { confirmInvite, createInvite, declineInvite, invitationLetter, withdrawInvite } from "@/domain/invites";
import { askForSeat, declineSeat, makeRoom, toggleSeatSupport, withdrawSeat } from "@/domain/seats";
import { setEmailPref } from "@/domain/notifications";
import type { PromptInput } from "@/domain/prompts";
import { suggestReply } from "@/domain/replies";
import { transcribeResponse } from "@/domain/transcripts";
import {
  postOpenQuestion, promoteRound, respond, revealNow, suggestRound, toggleSupport,
} from "@/domain/rounds";
import { deleteCircle, deleteRound, editQuestion } from "@/domain/authoring";
import { attempt, type ActionState } from "@/lib/actions";
import { deepgram } from "@/lib/deepgram";
import { loadGroup } from "@/lib/group";
import { sendMail } from "@/lib/email";
import { appUrl } from "@/lib/urls";

const str = (form: FormData, key: string) => String(form.get(key) || "");

export async function saveWelcomeNote(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { me, gathering } = await loadGroup(str(form, "gathering"));
  const failed = await attempt(() => updateWelcomeNote(db, { gatheringId: gathering.id, userId: me.id, note: str(form, "note") }));
  if (failed) return failed;
  revalidatePath(`/g/${gathering.slug}`, "layout");
  return { ok: "Saved." };
}

/** Setup: ask everyone a first question, of any shape, and pin it to the centre. */
export async function askAndPin(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { me, gathering } = await loadGroup(str(form, "gathering"));
  const failed = await attempt(async () => {
    const r = await postOpenQuestion(db, { gatheringId: gathering.id, userId: me.id, prompt: promptFrom(form), timerHours: str(form, "timer") || null });
    await pinQuestion(db, { gatheringId: gathering.id, userId: me.id, roundId: r.id });
  });
  if (failed) return failed;
  revalidatePath(`/g/${gathering.slug}`, "layout");
  return { ok: "Asked, and pinned to the centre." };
}

/** A host pins an open question to everyone to the centre, or unpins it. */
export async function pin(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { me, gathering } = await loadGroup(str(form, "gathering"));
  const unpin = str(form, "unpin") === "yes";
  const failed = await attempt(() => pinQuestion(db, { gatheringId: gathering.id, userId: me.id, roundId: unpin ? null : str(form, "round") }));
  if (failed) return failed;
  revalidatePath(`/g/${gathering.slug}`, "layout");
  return { ok: unpin ? "Unpinned." : "Pinned to the centre." };
}

/** The circle's host picks its colour. */
export async function circleColor(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { me, gathering } = await loadGroup(str(form, "gathering"));
  const circle = await circleById(db, str(form, "circle"));
  if (!circle || circle.rootId !== gathering.id) return { error: "That circle isn't here." };
  const failed = await attempt(() => setCircleColor(db, { circleId: circle.id, userId: me.id, color: str(form, "color") }));
  if (failed) return failed;
  revalidatePath(`/g/${gathering.slug}`, "layout");
  revalidatePath(`/g/${circle.slug}`, "layout");
  return { ok: "Saved." };
}

/** A circle on its own grows into a gathering, with itself as the first circle (GROUPS.md §4). */
export async function growIntoGathering(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { me, gathering } = await loadGroup(str(form, "gathering"));
  let made: { slug: string } | undefined;
  const failed = await attempt(async () => {
    made = await promoteCircle(db, { circleId: gathering.id, userId: me.id, name: str(form, "name"), welcomeNote: str(form, "note") });
  });
  if (failed) return failed;
  revalidatePath("/home");
  revalidatePath(`/g/${gathering.slug}`, "layout");
  redirect(`/g/${made!.slug}/setup`);
}

/** Archive the gathering from your own list (then home), or put it back (then into it). */
export async function archive(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { me, gathering } = await loadGroup(str(form, "gathering"));
  const archived = str(form, "archived") === "yes";
  const failed = await attempt(() => setArchived(db, { gatheringId: gathering.id, userId: me.id, archived }));
  if (failed) return failed;
  revalidatePath("/home");
  revalidatePath(`/g/${gathering.slug}`, "layout");
  redirect(archived ? "/home" : `/g/${gathering.slug}`);
}

export async function proposeCircle(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { me, gathering } = await loadGroup(str(form, "gathering"));
  let circle: Circle | undefined;
  const failed = await attempt(async () => {
    circle = await createCircle(db, {
      gatheringId: gathering.id, userId: me.id,
      name: str(form, "name"), description: str(form, "description"), firstQuestion: str(form, "question"),
      promptId: str(form, "prompt") || null, color: str(form, "color") || "saffron",
    });
  });
  if (failed) return failed;
  revalidatePath(`/g/${gathering.slug}`, "layout");
  const back = str(form, "back");
  if (back === "setup") return { ok: `${circle!.name} is up. Add another, or move on.` };
  redirect(`/g/${circle!.slug}`);
}

/** Send a confirmed invitation. It comes from whoever suggested them. */
async function sendInvitation(inviteId: string, token: string) {
  const l = await invitationLetter(db, inviteId);
  const lines = [
    l.circle
      ? `${l.from} invited you to join ${l.gathering.name}, and to sit in ${l.circle}, one of its circles.`
      : `${l.from} invited you to ${l.gathering.name}.`,
    l.note && `\n"${l.note}"`,
    l.gathering.welcomeNote && `\n${l.gathering.welcomeNote}`,
    `\nCome in: ${appUrl(`/invite/${token}`)}`,
    `\nThe link is yours alone and works for 30 days.`,
  ].filter(Boolean);
  await sendMail({ to: l.to, subject: `${l.from} invited you to ${l.gathering.name}`, text: lines.join("\n") });
}

/** Suggest someone. A host's suggestion goes straight out; anyone else's waits for a host. */
export async function invite(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { me, gathering } = await loadGroup(str(form, "gathering"));
  let made: Awaited<ReturnType<typeof createInvite>> | undefined;
  const failed = await attempt(async () => {
    made = await createInvite(db, {
      gatheringId: gathering.id, invitedBy: me.id, email: str(form, "email"), name: str(form, "name"),
      circleId: str(form, "circle") || null, note: str(form, "note"),
    });
  });
  if (failed) return failed;
  revalidatePath(`/g/${gathering.slug}`, "layout");
  if (made!.token) {
    await sendInvitation(made!.inviteId, made!.token);
    return { ok: `Invitation sent to ${made!.email}.` };
  }
  return { ok: "Suggested. A host will confirm before anything is sent." };
}

export async function confirmSuggestion(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { me, gathering } = await loadGroup(str(form, "gathering"));
  const inviteId = str(form, "invite");
  let token = "";
  const failed = await attempt(async () => {
    token = (await confirmInvite(db, { inviteId, userId: me.id })).token;
  });
  if (failed) return failed;
  await sendInvitation(inviteId, token);
  revalidatePath(`/g/${gathering.slug}`, "layout");
  return { ok: "Sent." };
}

export async function declineSuggestion(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { me, gathering } = await loadGroup(str(form, "gathering"));
  const failed = await attempt(() => declineInvite(db, { inviteId: str(form, "invite"), userId: me.id, note: str(form, "note") }));
  if (failed) return failed;
  revalidatePath(`/g/${gathering.slug}`, "layout");
  return undefined;
}

export async function withdrawSuggestion(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { me, gathering } = await loadGroup(str(form, "gathering"));
  const failed = await attempt(() => withdrawInvite(db, { inviteId: str(form, "invite"), userId: me.id }));
  if (failed) return failed;
  revalidatePath(`/g/${gathering.slug}`, "layout");
  return undefined;
}

// ── Seats ─────────────────────────────────────────────────────────────────

/** Ask for a seat in a running circle: for yourself, or (a member) for someone here. */
export async function askToJoin(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { me, gathering } = await loadGroup(str(form, "gathering"));
  const forUserId = str(form, "person") || me.id;
  const failed = await attempt(() => askForSeat(db, { circleId: str(form, "circle"), userId: me.id, forUserId, note: str(form, "note") }));
  if (failed) return failed;
  revalidatePath(`/g/${gathering.slug}`, "layout");
  return { ok: forUserId === me.id ? "Asked. The circle will decide." : "Suggested. The circle will decide." };
}

async function onSeat(form: FormData, act: (requestId: string, userId: string) => Promise<unknown>): Promise<ActionState> {
  const { me, gathering } = await loadGroup(str(form, "gathering"));
  const failed = await attempt(() => act(str(form, "seat"), me.id));
  if (failed) return failed;
  revalidatePath(`/g/${gathering.slug}`, "layout");
  return undefined;
}

export async function seatSupport(_prev: ActionState, form: FormData): Promise<ActionState> {
  return onSeat(form, (requestId, userId) => toggleSeatSupport(db, { requestId, userId }));
}

export async function seatMakeRoom(_prev: ActionState, form: FormData): Promise<ActionState> {
  return onSeat(form, (requestId, userId) => makeRoom(db, { requestId, userId }));
}

export async function seatDecline(_prev: ActionState, form: FormData): Promise<ActionState> {
  return onSeat(form, (requestId, userId) => declineSeat(db, { requestId, userId }));
}

export async function seatWithdraw(_prev: ActionState, form: FormData): Promise<ActionState> {
  return onSeat(form, (requestId, userId) => withdrawSeat(db, { requestId, userId }));
}

export async function join(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { me, gathering } = await loadGroup(str(form, "gathering"));
  const failed = await attempt(() => joinCircle(db, { circleId: str(form, "circle"), userId: me.id }));
  if (failed) return failed;
  revalidatePath(`/g/${gathering.slug}`, "layout");
  return undefined;
}

export async function removeCircle(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { me, gathering } = await loadGroup(str(form, "gathering"));
  const failed = await attempt(() => deleteCircle(db, { circleId: str(form, "circle"), userId: me.id }));
  if (failed) return failed;
  revalidatePath(`/g/${gathering.slug}`, "layout");
  redirect(`/g/${gathering.slug}`);
}

export async function leave(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { me, gathering } = await loadGroup(str(form, "gathering"));
  await leaveCircle(db, { circleId: str(form, "circle"), userId: me.id });
  revalidatePath(`/g/${gathering.slug}`, "layout");
  return undefined;
}

// ── Rounds ────────────────────────────────────────────────────────────────

function promptFrom(form: FormData): PromptInput {
  const reveal = str(form, "reveal");
  const shape = str(form, "shape");
  const axes = [[str(form, "axis1a"), str(form, "axis1b")], [str(form, "axis2a"), str(form, "axis2b")]]
    .filter(([a, b]) => a.trim() || b.trim())
    .map(([poleA, poleB]) => ({ poleA, poleB }));
  return {
    question: str(form, "question"),
    context: str(form, "context"),
    shape: shape === "placement" || shape === "story_placement" || shape === "words" ? shape : "story",
    telling: str(form, "telling") === "text" ? "text" : "voice",
    reveal: reveal === "open" || reveal === "after_share" ? reveal : "sealed",
    axes,
    placing: str(form, "placing") === "quadrants" ? "quadrants" : "free",
    seedWords: str(form, "words").split(/[,\n]/),
    pickMax: Number(str(form, "pickMax")) || undefined,
    coinMax: str(form, "coinMax") === "" ? undefined : Number(str(form, "coinMax")),
  };
}

export async function suggest(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { me, gathering } = await loadGroup(str(form, "gathering"));
  const circleId = str(form, "circle");
  const failed = await attempt(() =>
    suggestRound(db, { circleId, userId: me.id, prompt: promptFrom(form), timerHours: str(form, "timer") || null }),
  );
  if (failed) return failed;
  revalidatePath(`/g/${gathering.slug}`, "layout");
  return { ok: "Suggested. It opens once enough of the circle supports it." };
}

/** A follow-up round the whole circle takes a turn on, answering this one. */
export async function reply(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { me, gathering } = await loadGroup(str(form, "gathering"));
  const failed = await attempt(() =>
    suggestReply(db, {
      roundId: str(form, "round"), userId: me.id, prompt: promptFrom(form),
      responseId: str(form, "answer") || null, timerHours: str(form, "timer") || null,
    }),
  );
  if (failed) return failed;
  revalidatePath(`/g/${gathering.slug}`, "layout");
  return { ok: "Suggested. It starts once one more member supports it." };
}

export async function ask(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { me, gathering } = await loadGroup(str(form, "gathering"));
  let round: { id: string } | undefined;
  const failed = await attempt(async () => {
    round = await postOpenQuestion(db, {
      gatheringId: gathering.id, userId: me.id, prompt: promptFrom(form), timerHours: str(form, "timer") || null,
    });
  });
  if (failed) return failed;
  revalidatePath(`/g/${gathering.slug}`, "layout");
  redirect(`/g/${gathering.slug}/r/${round!.id}`);
}

export async function support(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { me, gathering } = await loadGroup(str(form, "gathering"));
  const failed = await attempt(() => toggleSupport(db, { roundId: str(form, "round"), userId: me.id }));
  if (failed) return failed;
  revalidatePath(`/g/${gathering.slug}`, "layout");
  return undefined;
}

export async function promote(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { me, gathering } = await loadGroup(str(form, "gathering"));
  const failed = await attempt(() => promoteRound(db, { roundId: str(form, "round"), userId: me.id }));
  if (failed) return failed;
  revalidatePath(`/g/${gathering.slug}`, "layout");
  return undefined;
}

/** Delete a question you asked that hasn't taken hold. From its own page, go back to where it lived. */
export async function remove(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { me, gathering } = await loadGroup(str(form, "gathering"));
  const failed = await attempt(() => deleteRound(db, { roundId: str(form, "round"), userId: me.id }));
  if (failed) return failed;
  revalidatePath(`/g/${gathering.slug}`, "layout");
  const back = str(form, "back");
  if (back) redirect(back.startsWith(`/g/${gathering.slug}`) ? back : `/g/${gathering.slug}`);
  return undefined;
}

export async function edit(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { me, gathering } = await loadGroup(str(form, "gathering"));
  const failed = await attempt(() =>
    editQuestion(db, { roundId: str(form, "round"), userId: me.id, question: str(form, "question"), context: str(form, "context") }),
  );
  if (failed) return failed;
  revalidatePath(`/g/${gathering.slug}`, "layout");
  return { ok: "Saved." };
}

export async function share(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { me, gathering } = await loadGroup(str(form, "gathering"));
  const audioUrl = str(form, "audioUrl") || null;
  const seconds = Number(str(form, "audioSeconds"));
  const num = (k: string) => (str(form, k) === "" ? undefined : Number(str(form, k)));
  const input = {
    ...(form.has("text") ? { text: str(form, "text") } : {}),
    ...(audioUrl ? { audioUrl, audioSeconds: Number.isFinite(seconds) && seconds > 0 ? seconds : null } : {}),
    ...(form.has("x") ? { x: num("x"), y: num("y") } : {}),
    ...(form.has("words") ? { pick: form.getAll("pick").map(String), coin: form.getAll("coin").map(String) } : {}),
  };
  let responseId = "";
  const failed = await attempt(async () => {
    responseId = await respond(db, { roundId: str(form, "round"), userId: me.id, input });
  });
  if (failed) return failed;
  // The transcript follows once the answer is saved; the clock catches any that don't.
  const transcribe = audioUrl ? deepgram() : null;
  if (transcribe) after(() => transcribeResponse(db, transcribe, responseId));
  revalidatePath(`/g/${gathering.slug}`, "layout");
  return { ok: "Shared." };
}

export async function reveal(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { me, gathering } = await loadGroup(str(form, "gathering"));
  const failed = await attempt(() => revealNow(db, { roundId: str(form, "round"), userId: me.id }));
  if (failed) return failed;
  revalidatePath(`/g/${gathering.slug}`, "layout");
  return undefined;
}

// ── The feed ──────────────────────────────────────────────────────────────

export async function suggestFromFeed(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { me, gathering } = await loadGroup(str(form, "gathering"));
  const failed = await attempt(() =>
    suggestRound(db, { circleId: str(form, "circle"), userId: me.id, prompt: { promptId: str(form, "prompt") } }),
  );
  if (failed) return failed;
  revalidatePath(`/g/${gathering.slug}`, "layout");
  return { ok: "Suggested to your circle." };
}

/** Adapt a question: a new prompt that remembers its parent, sent to one of your circles or to everyone. */
export async function adapt(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { me, gathering } = await loadGroup(str(form, "gathering"));
  const prompt = { ...promptFrom(form), adaptedFromId: str(form, "parent") };
  const to = str(form, "to");
  let href = "";
  const failed = await attempt(async () => {
    if (to === "everyone") {
      const r = await postOpenQuestion(db, { gatheringId: gathering.id, userId: me.id, prompt, timerHours: str(form, "timer") || null });
      href = `/g/${gathering.slug}/r/${r.id}`;
    } else {
      const r = await suggestRound(db, { circleId: to, userId: me.id, prompt, timerHours: str(form, "timer") || null });
      const circle = await circleById(db, r.groupId);
      href = `/g/${circle!.slug}`;
    }
  });
  if (failed) return failed;
  revalidatePath(`/g/${gathering.slug}`, "layout");
  redirect(href);
}

export async function emailPref(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { me, gathering } = await loadGroup(str(form, "gathering"));
  const pref = str(form, "pref");
  if (pref !== "each" && pref !== "digest" && pref !== "off") return { error: "Choose one." };
  await setEmailPref(db, { gatheringId: gathering.id, userId: me.id, pref });
  revalidatePath(`/g/${gathering.slug}`, "layout");
  return { ok: "Saved." };
}
