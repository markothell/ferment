import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { CIRCLE_MAX, CIRCLE_MIN, circleBySlug, circleHome } from "@/domain/circles";
import { approvalsNeeded, circleResponders, circleRounds } from "@/domain/rounds";
import { loadCommunity } from "@/lib/community";
import { displayName } from "@/lib/session";
import { CircleMap } from "@/components/app/CircleMap";
import { Form } from "@/components/app/Form";
import { PromptFields } from "@/components/app/PromptFields";
import { RoundRow } from "@/components/app/RoundRow";
import { Top } from "@/components/app/Top";
import { join, leave, promote, suggest, support, withdraw } from "../../actions";

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
        <header className="space-y-3">
          <span className="label">{forming ? "forming" : circle.status}</span>
          <h1 className="display text-4xl">{circle.name}</h1>
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
            roundBase={`/c/${community.slug}/r`}
            label={`${circle.name}: ${home.members.length} people${forming ? `, ${need} more to begin` : ""}. Rounds they've shared spiral in to what's open now.`}
          />
          <p className="mono text-center text-sm text-[var(--ink-soft)]">
            {home.members.length} of {CIRCLE_MAX}
            {host ? ` · hosted by ${displayName(host)}` : " · no host"}
          </p>
          {home.isMember ? null : home.members.length < CIRCLE_MAX ? (
            <Form action={join} submit="I'm in" pending="Joining…">{hidden}</Form>
          ) : (
            <p className="label">full</p>
          )}
        </section>

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
