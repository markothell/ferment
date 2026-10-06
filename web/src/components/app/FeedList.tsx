import Link from "next/link";
import type { FeedItem } from "@/domain/feed";
import { suggestFromFeed } from "@/app/(app)/c/[community]/actions";
import { Form } from "./Form";
import { CircleGlyph } from "./Glyph";
import { Ripple } from "./Ripple";

function meta(item: FeedItem) {
  const bits = [item.everyone ? `asked of everyone · ${item.everyone.answered} answered` : `${item.here} of ${item.total} circles here`];
  if (item.beyond) bits.push(`${item.beyond} ${item.beyond === 1 ? "community" : "communities"} beyond`);
  return bits.join(" · ");
}

/**
 * The feed: each question with its ripple, and where it's been one tap deeper.
 * <details> keeps it working without script.
 */
export function FeedList({
  items, community, openFirst = true, actions = true,
}: { items: FeedItem[]; community: string; openFirst?: boolean; actions?: boolean }) {
  const base = `/c/${community}`;
  const firstCircleQuestion = items.findIndex((i) => !i.everyone);
  return (
    <ol className="feed">
      {items.map((item, idx) => {
        const open = item.everyone?.open || item.openIn > 0;
        return (
          <li key={item.promptId} id={`p-${item.promptId}`} className="feed-item">
            <details open={openFirst && idx === firstCircleQuestion}>
              <summary className="feed-row">
                <Ripple share={item.here / item.total} everyoneOpen={Boolean(item.everyone?.open)} beyond={item.beyond} arrived={item.arrived} />
                <span className="grid min-w-0 gap-1">
                  <span className="leading-snug">{item.question}</span>
                  <span className="mono text-[11px] text-[var(--ink-faint)]">
                    {meta(item)}
                    {open && <span className="live">{item.everyone?.open ? " · ● open" : ` · ● open in ${item.openIn}`}</span>}
                    {item.harvests.length > 0 && (
                      <span>
                        {" · "}
                        <span className="inline-flex translate-y-[2px]"><CircleGlyph size={12} /></span>
                        {` ${item.harvests.length} ${item.harvests.length === 1 ? "harvest" : "harvests"}`}
                      </span>
                    )}
                  </span>
                </span>
                <span className="feed-chev" aria-hidden>›</span>
              </summary>

              <div className="feed-more">
                <p>
                  {item.everyone && !item.startedIn
                    ? `Asked of everyone by ${item.author}.`
                    : item.startedIn
                      ? <>Started in <Link className="link" href={`${base}/circles/${item.startedIn.slug}`}>{item.startedIn.name}</Link>, asked by {item.author}.</>
                      : `Asked by ${item.author}.`}
                  {item.adaptedFrom && (
                    <> Adapted from <Link className="link" href={`${base}/feed#p-${item.adaptedFrom.id}`}>“{item.adaptedFrom.question}”</Link>.</>
                  )}
                </p>

                {item.circles.length > 0 && (
                  <ul className="flex flex-wrap gap-1.5">
                    {item.circles.map((c) => (
                      <li key={c.id}>
                        <Link href={`${base}/circles/${c.slug}`} className="chip">
                          <span className={c.open ? "chip-dot chip-live" : "chip-dot"} aria-hidden />
                          {c.name}
                          {c.open && " · open now"}
                          {c.viaAdaptation && " · adapted"}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}

                {item.everyone && (
                  <p><Link className="link" href={`${base}/r/${item.everyone.roundId}`}>See the answers from everyone →</Link></p>
                )}

                {item.harvests.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="mono text-[11px] text-[var(--ink-faint)]">Opened to the community by</p>
                    <ul className="flex flex-wrap gap-1.5">
                      {item.harvests.map((h) => (
                        <li key={h.id}>
                          <Link href={`${base}/h/${h.id}`} className="chip">
                            <CircleGlyph size={14} color={h.circleColor} />
                            {h.circleName} · {h.shared} shared
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {item.replies.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="mono text-[11px] text-[var(--ink-faint)]">
                      {item.replies.length} {item.replies.length === 1 ? "reply" : "replies"} in circles
                    </p>
                    <ul className="space-y-1 border-l border-[var(--rule-strong)] pl-3">
                      {item.replies.map((r) => (
                        <li key={r.roundId} className="text-sm">
                          <Link className="link" href={`${base}/r/${r.roundId}`}>{r.question}</Link>
                          <span className="mono text-[11px] text-[var(--ink-faint)]">
                            {r.circle && ` · ${r.circle.name}`}
                            {r.open && <span className="live"> · ● open</span>}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {item.adaptations.length > 0 && (
                  <p>
                    Adapted as{" "}
                    {item.adaptations.map((a, k) => (
                      <span key={a.id}>{k > 0 && ", "}<Link className="link" href={`${base}/feed#p-${a.id}`}>“{a.question}”</Link></span>
                    ))}
                    .
                  </p>
                )}

                <p className="mono text-[11px] text-[var(--ink-faint)]">
                  {item.beyond
                    ? `Also asked in ${item.beyond} other ${item.beyond === 1 ? "community" : "communities"}. Their answers stay with them.`
                    : "Not asked in other communities yet."}
                </p>

                {actions && <div className="flex flex-wrap items-center gap-2">
                  {item.suggestable.length > 0 && (
                    <Form action={suggestFromFeed} submit="Suggest to my circle" quiet className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="community" value={community} />
                      <input type="hidden" name="prompt" value={item.promptId} />
                      {item.suggestable.length === 1 ? (
                        <input type="hidden" name="circle" value={item.suggestable[0].id} />
                      ) : (
                        <select name="circle" className="field !w-auto !py-2 text-sm" aria-label="Which circle">
                          {item.suggestable.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      )}
                    </Form>
                  )}
                  <Link href={`${base}/circles/new?prompt=${item.promptId}`} className="button-quiet">Start a circle around this</Link>
                  <Link href={`${base}/adapt/${item.promptId}`} className="button-quiet">Adapt</Link>
                </div>}
              </div>
            </details>
          </li>
        );
      })}
    </ol>
  );
}
