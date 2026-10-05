import { formatDuration } from "@/lib/audio/recorder";

export type Shared = {
  name: string; text: string; transcript: string | null; audioUrl: string | null; audioSeconds: number | null; words: string[];
};

/** One answer as the community sees it in a harvest: named, with its voice, words and text. */
export function SharedAnswer({ a, id, children }: { a: Shared; id?: string; children?: React.ReactNode }) {
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
      {a.words.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {a.words.map((w) => <li key={w} className="chip">{w}</li>)}
        </ul>
      )}
      {children}
    </div>
  );
}
