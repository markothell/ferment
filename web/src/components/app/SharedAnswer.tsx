import type { Axis } from "@/db/schema";
import { formatDuration } from "@/lib/audio/recorder";

export type Shared = {
  name: string; text: string; transcript: string | null; audioUrl: string | null; audioSeconds: number | null; words: string[];
  x: number | null; y: number | null;
};

/** Where someone placed themselves, in words: "slow · alone", or "70% of the way to slow". */
export function placedAt(axes: Axis[], x: number | null, y: number | null): string | null {
  if (x == null || !axes.length) return null;
  if (axes.length === 2 && y != null) return `${x < 0.5 ? axes[0].poleA : axes[0].poleB} · ${y < 0.5 ? axes[1].poleA : axes[1].poleB}`;
  return `${Math.round(x * 100)}% of the way to ${axes[0].poleB}`;
}

/** One answer as the gathering sees it in a harvest: named, with its voice, words and text. */
export function SharedAnswer({ a, axes = [], id, children }: { a: Shared; axes?: Axis[]; id?: string; children?: React.ReactNode }) {
  const placed = placedAt(axes, a.x, a.y);
  return (
    <div id={id} className="space-y-2 border-l-2 border-[var(--tint,var(--shared))] pl-3">
      <p className="font-medium">{a.name}</p>
      {a.audioUrl && (
        <div className="space-y-1">
          <audio controls preload="none" src={a.audioUrl} className="w-full" />
          {a.audioSeconds ? <p className="mono text-xs text-[var(--ink-faint)]">{formatDuration(a.audioSeconds * 1000)}</p> : null}
          {a.transcript && <p className="whitespace-pre-line text-[var(--ink-soft)]">{a.transcript}</p>}
        </div>
      )}
      {a.text && <p className="whitespace-pre-line">{a.text}</p>}
      {placed && <p className="mono text-xs text-[var(--ink-faint)]">{placed}</p>}
      {a.words.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {a.words.map((w) => <li key={w} className="chip">{w}</li>)}
        </ul>
      )}
      {children}
    </div>
  );
}
