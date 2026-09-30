/** The words the group chose, sized by how many chose each. */
export function WordsPortrait({ words }: { words: { label: string; count: number }[] }) {
  if (!words.length) return null;
  const max = Math.max(...words.map((w) => w.count));
  return (
    <figure className="space-y-2">
      <ul className="flex flex-wrap items-baseline justify-center gap-x-4 gap-y-1 py-2" aria-label="Words chosen, most chosen first">
        {words.map((w) => (
          <li
            key={w.label}
            className="display leading-tight"
            style={{ fontSize: `${Math.round(18 + 26 * (w.count / max))}px`, color: w.count === max ? "var(--ink)" : "var(--ink-soft)" }}
          >
            {w.label}
            <span className="mono ml-1 align-super text-[10px] text-[var(--ink-faint)]">{w.count}</span>
          </li>
        ))}
      </ul>
      <figcaption className="mono text-center text-xs text-[var(--ink-faint)]">sized by how many chose each</figcaption>
    </figure>
  );
}
