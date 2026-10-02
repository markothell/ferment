import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { CIRCLE_MAX, CIRCLE_MIN, circleBySlug, circleHome } from "@/domain/circles";
import { communityHome } from "@/domain/communities";
import { approvalsNeeded, circleResponders, circleRounds } from "@/domain/rounds";
import { myAsk, suggestableFor, waitingSeats } from "@/domain/seats";
import { loadCommunity } from "@/lib/community";
import { displayName } from "@/lib/session";
import { relative } from "@/lib/time";
import { CircleMap } from "@/components/app/CircleMap";
import { Form } from "@/components/app/Form";
import { CircleGlyph } from "@/components/app/Glyph";
import { PromptFields } from "@/components/app/PromptFields";
import { RoundRow } from "@/components/app/RoundRow";
import { Top } from "@/components/app/Top";
import { Field } from "@/components/app/Field";
import {
  askToJoin, join, leave, promote, seatDecline, seatMakeRoom, seatSupport, seatWithdraw, suggest, support, withdraw,
} from "../../actions";

type Props = PageProps<"/c/[community]/circles/[circle]">;

async function load(params: Props["params"]) {
  const p = await params;
  const ctx = await loadCommunity(p.community);
  const circle = await circleBySlug(db, ctx.community.id, p.circle);
  if (!circle) notFound();
  return { ...ctx, circle };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { circle } = await load(params);
  return { title: `${circle.name} · ferment` };
}

export default async function CirclePage({ params }: Props) {
  const { me, community, circle } = await load(params);
  const home = await circleHome(db, circle, me.id);
  const [all, responders] = home.isMember
    ? await Promise.all([circleRounds(db, circle.id, me.id), circleResponders(db, circle.id)])
    : [[], {} as Record<string, string[]>];
  const mapRounds = all
    .filter((r) => r.phase !== "skipped")
    .map((r) => ({
      id: r.id, question: r.question, phase: r.phase, authorId: r.authorId,
      responders: responders[r.id] ?? [], at: r.openedAt ?? r.createdAt, closesAt: r.closesAt, replyTo: r.replyToRoundId,
    }));
  const live = all.filter((r) => r.phase === "open");
  const queued = all.filter((r) => r.phase === "queued");
  const suggested = all.filter((r) => r.phase === "nominated");
  const past = all.filter((r) => r.phase === "closed").reverse();
  const needed = approvalsNeeded(circle, home.members.length);
  const neededForReply = approvalsNeeded(circle, home.members.length, { reply: true });
  const question = new Map(all.map((r) => [r.id, r.question]));
  const replyTo = (r: (typeof all)[number]) => (r.replyToRoundId ? question.get(r.replyToRoundId) ?? null : null);
  const isHost = circle.hostId === me.id;
  const roundHref = (id: string) => `/c/${community.slug}/r/${id}`;
  const host = home.members.find((m) => m.userId === circle.hostId);
  const forming = circle.status === "forming";
  const need = Math.max(0, CIRCLE_MIN - home.members.length);
  // A running circle grows by asking (domain/seats.ts); a forming one by "I'm in".
  const running = circle.status === "active" || circle.status === "idle";
  const [asking, mine, others] = await Promise.all([
    home.isMember && running ? waitingSeats(db, circle, me.id) : [],
    !home.isMember && running ? myAsk(db, circle.id, me.id) : null,
    home.isMember && running ? communityHome(db, community, me.id).then((c) => suggestableFor(db, circle, c.members)) : [],
  ]);
  const room = home.members.length < CIRCLE_MAX;
  const hidden = (
    <>
      <input type="hidden" name="community" value={community.slug} />
      <input type="hidden" name="circle" value={circle.id} />
    </>
  );

  return (
    <>
      <Top trail={[{ label: community.name, href: `/c/${community.slug}` }, { label: circle.name }]} />
      <main className="mx-auto max-w-2xl space-y-10 px-4 py-8">
        <header className="space-y-3 rounded-2xl bg-[color-mix(in_srgb,var(--shared-soft)_40%,transparent)] p-5">
          <div className="flex items-center gap-4">
            <CircleGlyph size={44} forming={forming} />
            <div className="min-w-0">
              <span className="label">{forming ? "forming" : circle.status === "active" ? "circle" : circle.status}</span>
              <h1 className="display truncate text-4xl leading-tight">{circle.name}</h1>
            </div>
          </div>
          {circle.description && <p className="text-[var(--ink-soft)]">{circle.description}</p>}
          {forming && (
            <p className="text-[var(--ink-soft)]">
              {need > 0 ? `Needs ${need} more to begin.` : "Ready to begin."}
            </p>
          )}
        </header>

        <section className="space-y-3">
          <CircleMap
            seats={home.members.map((m) => ({ id: m.userId, name: displayName(m) }))}
            rounds={mapRounds}
            emptySeats={forming ? need : 0}
            asking={asking.map((a) => ({ id: a.id, name: a.name }))}
            roundBase={`/c/${community.slug}/r`}
            label={`${circle.name}: ${home.members.length} people${forming ? `, ${need} more to begin` : ""}. Rounds they've shared spiral in to what's open now.`}
          />
          <p className="mono text-center text-sm text-[var(--ink-soft)]">
            {home.members.length} of {CIRCLE_MAX}
            {host ? ` · hosted by ${displayName(host)}` : " · no host"}
          </p>
          {home.isMember ? null : !room ? (
            <p className="label">full</p>
          ) : !running ? (
            <Form action={join} submit="I'm in" pending="Joining…">{hidden}</Form>
          ) : mine ? (
            <div className="card space-y-2">
              <p className="font-medium">You&apos;ve asked to join</p>
              <p className="mono text-xs text-[var(--ink-faint)]">
                {mine.supports} of {needed} to make room · asked {relative(mine.createdAt)}
              </p>
              <Form action={seatWithdraw} submit="Withdraw" quiet className="">
                {hidden}<input type="hidden" name="seat" value={mine.id} />
              </Form>
            </div>
          ) : (
            <details className="card">
              <summary className="cursor-pointer font-medium">Ask to join {circle.name}</summary>
              <div className="pt-4">
                <Form action={askToJoin} submit="Ask to join" pending="Asking…">
                  {hidden}
                  <p className="text-sm text-[var(--ink-soft)]">
                    The circle decides together: {needed} of its members, or its host, make room. You&apos;ll see what it has shared.
                  </p>
                  <Field label={`A note to ${circle.name}`} name="note" multiline maxLength={500} placeholder="Optional" />
                </Form>
              </div>
            </details>
          )}
        </section>

        {asking.length > 0 && (
          <section className="space-y-3">
            <h2 className="display text-2xl">Asking to join</h2>
            <ul className="space-y-3">
              {asking.map((a) => {
                const seat = <>{hidden}<input type="hidden" name="seat" value={a.id} /></>;
                return (
                  <li key={a.id} className="card space-y-3 border-l-2 border-l-[var(--mine)]">
                    <p className="font-medium">
                      {a.selfAsked ? `${a.name} asks to join` : `${a.askedBy === me.id ? "You" : a.asker} suggested ${a.name}`}
                      {a.newcomer && <span className="label ml-2">new to {community.name}</span>}
                    </p>
                    {a.note && <blockquote className="border-l-2 border-[var(--mine)] pl-3">{a.note}</blockquote>}
                    <p className="mono text-xs text-[var(--ink-faint)]">
                      {a.supports} of {a.needed} to make room · lapses {relative(a.expiresAt)} · {a.name} will see what {circle.name} has shared
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Form action={seatSupport} submit={a.supportedByMe ? "● supported" : "○ support"} quiet className="">{seat}</Form>
                      {isHost && room && <Form action={seatMakeRoom} submit="Make room" quiet className="">{seat}</Form>}
                      {isHost && <Form action={seatDecline} submit="Not now" quiet className="">{seat}</Form>}
                      {a.askedBy === me.id && <Form action={seatWithdraw} submit="Withdraw" quiet className="">{seat}</Form>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {home.isMember && (
          <>
            <section className="space-y-3">
              <h2 className="display text-2xl">Open now</h2>
              {live.length === 0 ? (
                <p className="text-[var(--ink-soft)]">
                  {forming ? "The first question opens when the circle begins." : "Nothing open. Suggest a question below."}
                </p>
              ) : (
                <ul className="space-y-3">
                  {live.map((r) => <RoundRow key={r.id} round={r} href={roundHref(r.id)} expected={home.members.length} replyTo={replyTo(r)} />)}
                </ul>
              )}
            </section>

            {(queued.length > 0 || suggested.length > 0) && (
              <section className="space-y-3">
                <h2 className="display text-2xl">Waiting</h2>
                <ul className="space-y-3">
                  {[...queued, ...suggested].map((r) => (
                    <li key={r.id} className="card space-y-3">
                      <span className="label">
                        {r.phase === "queued"
                          ? (r.promotedAt ? "up next · promoted" : "up next")
                          : `${r.replyToRoundId ? "reply" : "suggested"} · ${r.supports} of ${r.replyToRoundId ? neededForReply : needed} to queue`}
                      </span>
                      {r.replyToRoundId && (
                        <p className="text-sm text-[var(--ink-soft)]">
                          replying to <Link href={roundHref(r.replyToRoundId)} className="link">{replyTo(r)}</Link>
                        </p>
                      )}
                      <p className="text-lg leading-snug">{r.question}</p>
                      <p className="text-sm text-[var(--ink-soft)]">from {r.authorId === me.id ? "you" : displayName({ name: r.authorName, email: r.authorEmail })}</p>
                      <div className="flex flex-wrap gap-2">
                        {r.phase === "nominated" && (
                          <Form action={support} submit={r.supportedByMe ? "● supported" : "○ support"} quiet className="">
                            {hidden}<input type="hidden" name="round" value={r.id} />
                          </Form>
                        )}
                        {isHost && (r.phase === "nominated" || !r.promotedAt) && (
                          <Form action={promote} submit="Promote" quiet className="">
                            {hidden}<input type="hidden" name="round" value={r.id} />
                          </Form>
                        )}
                        {(isHost || r.authorId === me.id) && (
                          <Form action={withdraw} submit="Withdraw" quiet className="">
                            {hidden}<input type="hidden" name="round" value={r.id} />
                          </Form>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {running && room && others.length > 0 && (
              <details className="card">
                <summary className="cursor-pointer font-medium">Suggest someone for {circle.name}</summary>
                <div className="pt-4">
                  <Form action={askToJoin} submit="Suggest them" pending="Suggesting…">
                    {hidden}
                    <label className="block space-y-2">
                      <span className="block font-medium">Who</span>
                      <select name="person" className="field" required defaultValue="">
                        <option value="" disabled>Someone in {community.name}</option>
                        {others.map((o) => <option key={o.userId} value={o.userId}>{displayName(o)}</option>)}
                      </select>
                    </label>
                    <Field label="Why them" name="note" multiline maxLength={500} placeholder="Optional" />
                    <p className="text-sm text-[var(--ink-soft)]">Your support counts. Someone new to {community.name}? <Link href={`/c/${community.slug}/invite`} className="link">Suggest inviting them</Link>.</p>
                  </Form>
                </div>
              </details>
            )}

            <details className="card">
              <summary className="cursor-pointer font-medium">Suggest a question</summary>
              <div className="pt-4">
                <Form action={suggest} submit="Suggest" pending="Suggesting…">
                  {hidden}
                  <PromptFields />
                </Form>
              </div>
            </details>

            {past.length > 0 && (
              <section className="space-y-3">
                <h2 className="display text-2xl">Before</h2>
                <ul className="space-y-3">
                  {past.map((r) => <RoundRow key={r.id} round={r} href={roundHref(r.id)} replyTo={replyTo(r)} />)}
                </ul>
              </section>
            )}

            <section className="border-t border-[var(--rule)] pt-6">
              <Form action={leave} submit="Leave this circle" pending="Leaving…" buttonClass="link text-sm" className="">{hidden}</Form>
            </section>
          </>
        )}
      </main>
    </>
  );
}
