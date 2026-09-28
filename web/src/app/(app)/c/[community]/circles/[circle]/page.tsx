import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { CIRCLE_MAX, CIRCLE_MIN, circleBySlug, circleHome } from "@/domain/circles";
import { loadCommunity } from "@/lib/community";
import { displayName } from "@/lib/session";
import { Form } from "@/components/app/Form";
import { Top } from "@/components/app/Top";
import { join, leave } from "../../actions";

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

const PHASE_LABEL: Record<string, string> = {
  nominated: "suggested", queued: "up next", open: "open", closed: "closed", skipped: "skipped",
};

export default async function CirclePage({ params }: Props) {
  const { me, community, circle } = await load(params);
  const home = await circleHome(db, circle, me.id);
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
      <Top here={{ label: community.name, href: `/c/${community.slug}` }} />
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
          <h2 className="display text-2xl">
            Who&apos;s in <span className="mono text-base text-[var(--ink-faint)]">{home.members.length} of {CIRCLE_MAX}</span>
          </h2>
          <ul className="flex flex-wrap gap-2">
            {home.members.map((m) => (
              <li key={m.userId} className="rounded-full border border-[var(--rule)] px-3 py-1 text-sm">
                {displayName(m)}
                {circle.hostId === m.userId && <span className="label ml-2">host</span>}
              </li>
            ))}
          </ul>
          {home.isMember ? (
            <Form action={leave} submit="Leave this circle" pending="Leaving…" quiet>{hidden}</Form>
          ) : home.members.length < CIRCLE_MAX ? (
            <Form action={join} submit="I'm in" pending="Joining…">{hidden}</Form>
          ) : (
            <p className="label">full</p>
          )}
        </section>

        {home.isMember && (
          <section className="space-y-3">
            <h2 className="display text-2xl">Rounds</h2>
            {home.rounds.length === 0 ? (
              <p className="text-[var(--ink-soft)]">No questions yet. Suggesting one comes with rounds, next.</p>
            ) : (
              <ul className="space-y-3">
                {home.rounds.map((r) => (
                  <li key={r.id} className="card space-y-1">
                    <span className={r.phase === "open" ? "label live" : "label"}>{PHASE_LABEL[r.phase]}</span>
                    <p className="text-lg">{r.question}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </main>
    </>
  );
}
