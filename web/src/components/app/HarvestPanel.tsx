import Link from "next/link";
import type { Axis } from "@/db/schema";
import type { harvestForRound } from "@/domain/harvests";
import { HARVEST_MIN } from "@/domain/harvests";
import { chooseHarvestAction, proposeHarvestAction, withdrawHarvestAction } from "@/app/(app)/c/[community]/h/actions";
import { relative } from "@/lib/time";
import { Form } from "./Form";
import { SharedAnswer, type Shared } from "./SharedAnswer";

type View = NonNullable<Awaited<ReturnType<typeof harvestForRound>>>;

const day = (d: Date) => d.toLocaleDateString("en", { day: "numeric", month: "long" });

/**
 * On a closed round, for people in its circle: open it to the community
 * (design/ferment/archive/harvests.html). Each person who answered decides
 * about their own answer; only the yeses go in.
 */
export function HarvestPanel({
  community, communityName, roundId, answered, view, mine, axes,
}: {
  community: string; communityName: string; roundId: string; answered: number; view: View | null; axes: Axis[];
  /** The viewer's own answer, as the community would see it; null if they didn't answer. */
  mine: Shared | null;
}) {
  const fields = (extra?: React.ReactNode) => (
    <>
      <input type="hidden" name="community" value={community} />
      {view && <input type="hidden" name="harvest" value={view.harvest.id} />}
      {extra}
    </>
  );
  const h = view?.harvest;
  const active = h && (h.status === "gathering" || h.status === "up");

  if (!active) {
    return (
      <section className="card space-y-3">
        <h2 className="font-medium">Open this round to {communityName}</h2>
        <p className="text-sm text-[var(--ink-soft)]">
          Anyone here can propose it. Each person who answered decides about their own answer, and only the yeses go in. It goes up once {HARVEST_MIN} say yes.
        </p>
        {h?.status === "lapsed" && (
          <p className="mono text-xs text-[var(--ink-faint)]">Last proposed {relative(h.createdAt)}: {view!.shared} said yes.</p>
        )}
        {h?.status === "down" && (
          <p className="mono text-xs text-[var(--ink-faint)]">It was open to {communityName} until fewer than {HARVEST_MIN} were sharing.</p>
        )}
        {answered < HARVEST_MIN ? (
          <p className="text-sm text-[var(--ink-soft)]">It takes {HARVEST_MIN} answers, and this round has {answered}.</p>
        ) : (
          <Form action={proposeHarvestAction} submit="Propose" pending="Proposing…" quiet className="space-y-2">
            {fields(<input type="hidden" name="round" value={roundId} />)}
            {mine && <p className="text-sm text-[var(--ink-soft)]">Proposing puts yours in. You can take it out later.</p>}
          </Form>
        )}
      </section>
    );
  }

  const up = h.status === "up";
  return (
    <section className="card space-y-4">
      <div className="space-y-1">
        <h2 className="font-medium">{up ? `Open to ${communityName}` : `${view.proposer} proposed opening this to ${communityName}`}</h2>
        <p className="mono text-xs text-[var(--ink-soft)]">
          {up ? `${view.shared} of ${h.answered} shared` : `${view.shared} of ${HARVEST_MIN} to go up`}
          {view.open ? ` · yeses until ${day(h.closesAt)}` : ""}
        </p>
        {up && <Link href={`/c/${community}/h/${h.id}`} className="link text-sm">See the harvest</Link>}
      </div>

      {!mine ? (
        <p className="text-sm text-[var(--ink-soft)]">You didn&apos;t answer this round, so there&apos;s nothing of yours to share.</p>
      ) : view.mineIn ? (
        <Form action={withdrawHarvestAction} submit="Take mine out" pending="Taking it out…" quiet className="flex flex-wrap items-center gap-3">
          {fields(<p className="text-sm">Yours is in.</p>)}
        </Form>
      ) : view.open ? (
        <div className="space-y-3">
          <p className="mono text-xs text-[var(--ink-faint)]">Yours, as {communityName} would see it</p>
          <SharedAnswer a={mine} axes={axes} />
          {view.myChoice === "keep" && <p className="text-sm text-[var(--ink-soft)]">You&apos;re keeping yours in the circle. You can change that until {day(h.closesAt)}.</p>}
          <div className="flex flex-wrap gap-2">
            <Form action={chooseHarvestAction} submit="Share mine" pending="Sharing…" className="" buttonClass="button !w-auto px-6">
              {fields(<input type="hidden" name="share" value="yes" />)}
            </Form>
            {view.myChoice !== "keep" && (
              <Form action={chooseHarvestAction} submit="Keep mine in the circle" pending="Saving…" quiet className="">
                {fields(<input type="hidden" name="share" value="no" />)}
              </Form>
            )}
          </div>
        </div>
      ) : (
        <p className="text-sm text-[var(--ink-soft)]">The week for sharing has ended.</p>
      )}

      <p className="mono text-xs text-[var(--ink-faint)]">Saying nothing is the same as keeping yours. Nobody is told who keeps theirs.</p>
    </section>
  );
}
