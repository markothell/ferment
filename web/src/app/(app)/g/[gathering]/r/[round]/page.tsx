import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { circleById } from "@/domain/circles";
import { Refusal } from "@/domain/errors";
import { harvestForRound } from "@/domain/harvests";
import { replyContext, repliesTo } from "@/domain/replies";
import { authorRights } from "@/domain/authoring";
import { roundView } from "@/domain/rounds";
import { formatDuration } from "@/lib/audio/recorder";
import { audioStorage } from "@/lib/audioStore";
import { loadGathering } from "@/lib/gathering";
import { displayName } from "@/lib/session";
import { relative } from "@/lib/time";
import { Composer } from "@/components/app/Composer";
import { ConfirmForm } from "@/components/app/ConfirmForm";
import { Field } from "@/components/app/Field";
import { Form } from "@/components/app/Form";
import { HarvestPanel } from "@/components/app/HarvestPanel";
import { PlacementInput } from "@/components/app/PlacementInput";
import { PlacementResult } from "@/components/app/PlacementResult";
import { WordsInput } from "@/components/app/WordsInput";
import { WordsPortrait } from "@/components/app/WordsPortrait";
import { Top } from "@/components/app/Top";
import { TurnDot } from "@/components/app/TurnDot";
import Link from "next/link";
import { PromptFields } from "@/components/app/PromptFields";
import { edit, remove, reply, reveal, share } from "../../actions";

type Props = PageProps<"/g/[gathering]/r/[round]">;

async function load(params: Props["params"]) {
  const p = await params;
  const ctx = await loadGathering(p.gathering);
  const view = await roundView(db, p.round, ctx.me.id).catch((e) => {
    if (e instanceof Refusal) notFound();
    throw e;
  });
  if (view.round.gatheringId !== ctx.gathering.id) notFound();
  const circle = view.round.circleId ? await circleById(db, view.round.circleId) : null;
  const [replies, context] = circle && view.canTakePart
    ? await Promise.all([repliesTo(db, view.round.id, ctx.me.id), replyContext(db, view.round, ctx.me.id)])
    : [[], null];
  const harvest = circle && view.canTakePart && view.round.phase === "closed" ? await harvestForRound(db, view.round.id, ctx.me.id) : undefined;
  const rights = await authorRights(db, view.round, ctx.me.id);
  return { ...ctx, view, circle, replies, context, harvest, rights };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { view } = await load(params);
  return { title: `${view.prompt.question} · ferment` };
}

const REVEAL_NOTE = {
  all: "",
  after_share: "Share yours to see everyone's.",
  own: "Sealed: you'll see everyone's when it closes.",
} as const;

export default async function RoundPage({ params }: Props) {
  const { me, gathering, view, circle, replies, context, harvest, rights } = await load(params);
  const { round, prompt } = view;
  const base = `/g/${gathering.slug}`;
  const open = round.phase === "open";
  const closed = round.phase === "closed";
  const hidden = (
    <>
      <input type="hidden" name="gathering" value={gathering.slug} />
      <input type="hidden" name="round" value={round.id} />
    </>
  );
  const tells = prompt.shape === "story" || prompt.shape === "story_placement";
  const places = prompt.shape === "placement" || prompt.shape === "story_placement";
  // After the close only words can change, so a placement or words answer is settled once given.
  const canWrite = view.canTakePart && (open || closed) && (!view.mine || open || (round.editAfterClose && tells));
  const placing = places ? (
    <PlacementInput axes={prompt.axes} placing={prompt.placing} initial={view.mine ? { x: view.mine.x, y: view.mine.y } : null} />
  ) : null;
  const trail = [
    { label: gathering.name, href: base },
    ...(circle ? [{ label: circle.name, href: `${base}/circles/${circle.slug}` }] : []),
    { label: round.welcome ? "Welcome question" : round.replyToRoundId ? "Reply" : circle ? "Round" : "Open question" },
  ];
  // A reply is a follow-up round for the whole circle (domain/replies.ts): only
  // to a round that has happened, and only once you can see its answers.
  const replyable = Boolean(circle) && view.canTakePart && (open || closed);
  const replyBlocked = !replyable ? null : view.visibility === "own" ? "You can reply once this one closes." : view.visibility === "after_share" ? "Share yours first, then you can reply." : null;
  const REPLY_STATE = { nominated: "waiting for support", queued: "up next", open: "open now", closed: "explored" } as const;

  return (
    <>
      <Top trail={trail} />
      <main className="mx-auto max-w-2xl space-y-10 px-4 py-8">
        <header className="space-y-3">
          <span className={open ? "label live flex items-center gap-2" : "label"}>
            <TurnDot open={open} answered={Boolean(view.mine)} />
            {round.welcome ? "welcome question" : circle ? `a ${round.replyToRoundId ? "reply" : "round"} in ${circle.name}` : "open question"}
            {" · "}
            {open ? (round.closesAt ? `closes ${relative(round.closesAt)}` : "open") : round.phase === "closed" ? "closed" : "not open yet"}
          </span>
          {context && (
            <p className="mono text-xs text-[var(--ink-faint)]">
              replying to{" "}
              {context.chain.map((c, i) => (
                <span key={c.id}>
                  {i > 0 && " › "}
                  <Link href={`${base}/r/${c.id}`} className="link">{c.question}</Link>
                </span>
              ))}
            </p>
          )}
          <h1 className="display text-4xl leading-tight">{prompt.question}</h1>
          {context?.answer && (
            <blockquote className="space-y-1 border-l-2 border-[var(--shared)] pl-3">
              <p className="mono text-xs text-[var(--ink-faint)]">following up on {context.answer.name === "you" ? "your" : `${context.answer.name}'s`} answer</p>
              {context.answer.audioUrl && <audio controls preload="none" src={context.answer.audioUrl} className="w-full" />}
              {context.answer.text && <p className="whitespace-pre-line">{context.answer.text}</p>}
            </blockquote>
          )}
          {prompt.context && <p className="whitespace-pre-line text-[var(--ink-soft)]">{prompt.context}</p>}
          <p className="mono text-sm text-[var(--ink-soft)]">
            {view.responders.length}
            {view.expected ? ` of ${view.expected}` : ""} shared
          </p>
        </header>

        {canWrite && (
          <section className="card space-y-3">
            <h2 className="font-medium">{view.mine ? "Your answer" : "Your turn"}</h2>
            {view.mine && closed && !round.editAfterClose ? null : tells ? (
              <Composer
                action={share}
                gathering={gathering.slug}
                roundId={round.id}
                telling={prompt.telling ?? "voice"}
                maxSeconds={prompt.secondsPerNote ?? 60}
                storage={audioStorage()}
                existing={view.mine ? { text: view.mine.text, audioUrl: view.mine.audioUrl, audioSeconds: view.mine.audioSeconds } : null}
                submitLabel={view.mine ? "Update" : "Share"}
              >
                {!(closed && view.mine) && placing}
              </Composer>
            ) : (
              <Form action={share} submit={view.mine ? "Update" : "Share"} pending="Sharing…">
                {hidden}
                {placing}
                {prompt.shape === "words" && (
                  <WordsInput
                    vocabulary={view.vocabulary}
                    pickMax={prompt.pickMax ?? 5}
                    coinMax={prompt.coinMax ?? 0}
                    initialPicks={view.vocabulary.filter((w) => view.mine?.words.includes(w.label)).map((w) => w.id)}
                  />
                )}
              </Form>
            )}
          </section>
        )}

        <section className="space-y-4">
          <h2 className="display text-2xl">What people shared</h2>
          {REVEAL_NOTE[view.visibility] && <p className="text-[var(--ink-soft)]">{REVEAL_NOTE[view.visibility]}</p>}
          {places && view.responses.length > 0 && (
            <PlacementResult
              axes={prompt.axes}
              dots={view.responses.map((r) => ({ id: r.id, name: displayName(r), x: r.x, y: r.y, mine: r.userId === me.id }))}
              x={view.aggregate?.x ?? null}
              y={view.aggregate?.y ?? null}
            />
          )}
          {prompt.shape === "words" && view.aggregate && <WordsPortrait words={view.aggregate.words} />}
          {view.responses.length === 0 ? (
            view.visibility === "all" && <p className="text-[var(--ink-soft)]">Nothing yet.</p>
          ) : (
            <ul className="space-y-3">
              {view.responses.map((r) => {
                const isMine = r.userId === me.id;
                return (
                  <li key={r.id} id={`answer-${r.id}`} className="card space-y-2">
                    <p className={isMine ? "font-medium text-[var(--mine)]" : "font-medium"}>
                      {isMine ? "You" : displayName(r)}
                    </p>
                    {r.audioUrl && (
                      <div className="space-y-1">
                        <audio controls preload="none" src={r.audioUrl} className="w-full" />
                        {r.audioSeconds ? <p className="mono text-xs text-[var(--ink-faint)]">{formatDuration(r.audioSeconds * 1000)}</p> : null}
                        {r.transcriptStatus === "ready" && r.transcript && (
                          <p className="whitespace-pre-line text-[var(--ink-soft)]">{r.transcript}</p>
                        )}
                      </div>
                    )}
                    {r.text && <p className="whitespace-pre-line">{r.text}</p>}
                    {r.words.length > 0 && (
                      <ul className="flex flex-wrap gap-1.5">
                        {r.words.map((w) => <li key={w} className="chip">{w}</li>)}
                      </ul>
                    )}
                    {prompt.shape === "placement" && r.x != null && (
                      <p className="mono text-xs text-[var(--ink-faint)]">
                        {prompt.axes.length === 2
                          ? `${r.x < 0.5 ? prompt.axes[0].poleA : prompt.axes[0].poleB} · ${r.y! < 0.5 ? prompt.axes[1].poleA : prompt.axes[1].poleB}`
                          : `${Math.round(r.x * 100)}% of the way to ${prompt.axes[0].poleB}`}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {harvest !== undefined && (
          <div className={`tint-${circle!.color}`}>
            <HarvestPanel
              gathering={gathering.slug}
              gatheringName={gathering.name}
              roundId={round.id}
              answered={view.responders.length}
              axes={prompt.axes}
              view={harvest}
              mine={view.mine ? {
                name: displayName(view.mine), text: view.mine.text, audioUrl: view.mine.audioUrl, audioSeconds: view.mine.audioSeconds,
                transcript: view.mine.transcriptStatus === "ready" ? view.mine.transcript : null, words: view.mine.words,
                x: view.mine.x, y: view.mine.y,
              } : null}
            />
          </div>
        )}

        {replyable && (
          <section className="space-y-4 border-t border-[var(--rule)] pt-6">
            <h2 className="display text-2xl">Replies to this round</h2>
            {replies.length === 0 ? (
              <p className="text-[var(--ink-soft)]">None yet. A reply is a follow-up question for the whole circle, and it branches off this round on the map.</p>
            ) : (
              <ul className="space-y-3">
                {replies.map((r) => (
                  <li key={r.id}>
                    <Link href={`${base}/r/${r.id}`} className="card block space-y-1">
                      <span className={r.phase === "open" ? "label live" : "label"}>
                        {REPLY_STATE[r.phase as keyof typeof REPLY_STATE]}
                        {r.phase === "open" || r.phase === "closed" ? ` · ${r.shared} shared` : ""}
                      </span>
                      <p className="text-lg leading-snug">{r.question}</p>
                      <p className="text-sm text-[var(--ink-soft)]">from {r.author}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {replyBlocked ? (
              <p className="text-sm text-[var(--ink-soft)]">{replyBlocked}</p>
            ) : (
              <details className="card">
                <summary className="cursor-pointer font-medium">Reply to this round</summary>
                <div className="pt-4">
                  <Form action={reply} submit="Suggest this reply" pending="Suggesting…">
                    {hidden}
                    {view.responses.some((r) => r.userId !== me.id) && (
                      <label className="block space-y-2">
                        <span className="block font-medium">About</span>
                        <select name="answer" className="field" defaultValue="">
                          <option value="">The whole round</option>
                          {view.responses.filter((r) => r.userId !== me.id).map((r) => (
                            <option key={r.id} value={r.id}>{displayName(r)}&apos;s answer</option>
                          ))}
                        </select>
                      </label>
                    )}
                    <PromptFields defaults={{ reveal: prompt.reveal }} />
                  </Form>
                </div>
              </details>
            )}
          </section>
        )}

        {(rights.edit || rights.delete) && (
          <section id="edit" className="space-y-4 border-t border-[var(--rule)] pt-6">
            {rights.edit && (
              <details className="card">
                <summary className="cursor-pointer font-medium">Edit the question</summary>
                <div className="pt-4">
                  <Form action={edit} submit="Save" pending="Saving…">
                    {hidden}
                    <Field label="Question" name="question" defaultValue={prompt.question} maxLength={200} required />
                    <Field label="Context" name="context" defaultValue={prompt.context} multiline maxLength={1000} placeholder="Optional" />
                    <p className="text-sm text-[var(--ink-soft)]">You can change the words until someone else answers.</p>
                  </Form>
                </div>
              </details>
            )}
            {rights.delete && (
              <ConfirmForm
                action={remove}
                submit="Delete this question"
                confirm={circle ? `This removes it from ${circle.name} for good.` : "This deletes the question and anything said on it."}
              >
                {hidden}
                <input type="hidden" name="back" value={circle ? `${base}/circles/${circle.slug}` : base} />
              </ConfirmForm>
            )}
          </section>
        )}

        {open && view.mayConduct && !round.welcome && (
          <section className="border-t border-[var(--rule)] pt-6">
            <Form action={reveal} submit="Close and reveal now" pending="Revealing…" quiet>{hidden}</Form>
          </section>
        )}
      </main>
    </>
  );
}
