import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { circleById } from "@/domain/circles";
import { Refusal } from "@/domain/errors";
import { roundView } from "@/domain/rounds";
import { loadCommunity } from "@/lib/community";
import { displayName } from "@/lib/session";
import { relative } from "@/lib/time";
import { Form } from "@/components/app/Form";
import { Mark } from "@/components/app/Mark";
import { Top } from "@/components/app/Top";
import { TurnDot } from "@/components/app/TurnDot";
import { mark, reveal, share } from "../../actions";

type Props = PageProps<"/c/[community]/r/[round]">;

async function load(params: Props["params"]) {
  const p = await params;
  const ctx = await loadCommunity(p.community);
  const view = await roundView(db, p.round, ctx.me.id).catch((e) => {
    if (e instanceof Refusal) notFound();
    throw e;
  });
  if (view.round.communityId !== ctx.community.id) notFound();
  const circle = view.round.circleId ? await circleById(db, view.round.circleId) : null;
  return { ...ctx, view, circle };
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
  const { me, community, view, circle } = await load(params);
  const { round, prompt } = view;
  const base = `/c/${community.slug}`;
  const open = round.phase === "open";
  const closed = round.phase === "closed";
  const hidden = (
    <>
      <input type="hidden" name="community" value={community.slug} />
      <input type="hidden" name="round" value={round.id} />
    </>
  );
  const canWrite = view.canTakePart && (open || closed) && (!view.mine || open || round.editAfterClose);
  const trail = [
    { label: community.name, href: base },
    ...(circle ? [{ label: circle.name, href: `${base}/circles/${circle.slug}` }] : []),
    { label: round.welcome ? "Welcome question" : circle ? "Round" : "Open question" },
  ];

  return (
    <>
      <Top trail={trail} />
      <main className="mx-auto max-w-2xl space-y-10 px-4 py-8">
        <header className="space-y-3">
          <span className={open ? "label live flex items-center gap-2" : "label"}>
            <TurnDot open={open} answered={Boolean(view.mine)} />
            {round.welcome ? "welcome question" : circle ? `a round in ${circle.name}` : "open question"}
            {" · "}
            {open ? (round.closesAt ? `closes ${relative(round.closesAt)}` : "open") : round.phase === "closed" ? "closed" : "not open yet"}
          </span>
          <h1 className="display text-4xl leading-tight">{prompt.question}</h1>
          {prompt.context && <p className="whitespace-pre-line text-[var(--ink-soft)]">{prompt.context}</p>}
          <p className="mono text-sm text-[var(--ink-soft)]">
            {view.responders.length}
            {view.expected ? ` of ${view.expected}` : ""} shared
          </p>
        </header>

        {canWrite && (
          <section className="card space-y-3">
            <h2 className="font-medium">{view.mine ? "Your answer" : "Your turn"}</h2>
            {view.mine && closed && !round.editAfterClose ? null : (
              <Form action={share} submit={view.mine ? "Update" : "Share"} pending="Sharing…">
                {hidden}
                <textarea
                  name="text"
                  rows={5}
                  className="field"
                  defaultValue={view.mine?.text ?? ""}
                  placeholder={prompt.telling === "voice" ? "Voice recording is coming next. For now, write it." : "Write it here."}
                  maxLength={5000}
                />
              </Form>
            )}
          </section>
        )}

        <section className="space-y-4">
          <h2 className="display text-2xl">What people shared</h2>
          {REVEAL_NOTE[view.visibility] && <p className="text-[var(--ink-soft)]">{REVEAL_NOTE[view.visibility]}</p>}
          {view.responses.length === 0 ? (
            view.visibility === "all" && <p className="text-[var(--ink-soft)]">Nothing yet.</p>
          ) : (
            <ul className="space-y-3">
              {view.responses.map((r) => {
                const isMine = r.userId === me.id;
                const reacted = r.reactedBy.includes(me.id);
                return (
                  <li key={r.id} className="card space-y-2">
                    <p className={isMine ? "font-medium text-[var(--mine)]" : "font-medium"}>
                      {isMine ? "You" : displayName(r)}
                    </p>
                    {r.text && <p className="whitespace-pre-line">{r.text}</p>}
                    {round.reactions && !isMine ? (
                      <Mark
                        on={reacted}
                        count={r.reactedBy.length}
                        action={mark}
                        fields={{ community: community.slug, round: round.id, response: r.id }}
                      />
                    ) : r.reactedBy.length > 0 ? (
                      <span className="mono text-xs text-[var(--ink-faint)]">○ {r.reactedBy.length}</span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {open && view.mayConduct && !round.welcome && (
          <section className="border-t border-[var(--rule)] pt-6">
            <Form action={reveal} submit="Close and reveal now" pending="Revealing…" quiet>{hidden}</Form>
          </section>
        )}
      </main>
    </>
  );
}
