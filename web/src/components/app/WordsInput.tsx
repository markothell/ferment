"use client";

import { useState } from "react";

/**
 * Choose words: tap up to `pickMax` from the round's list, and add up to
 * `coinMax` of your own. Chosen words travel as pick (ids) and coin (labels).
 */
export function WordsInput({
  vocabulary, pickMax, coinMax, initialPicks,
}: {
  vocabulary: { id: string; label: string; origin: string }[];
  pickMax: number;
  coinMax: number;
  initialPicks: string[];
}) {
  const [picks, setPicks] = useState<string[]>(initialPicks);
  const [coins, setCoins] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const full = picks.length >= pickMax;

  function toggle(id: string) {
    setPicks((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < pickMax ? [...p, id] : p));
  }
  function addCoin() {
    const w = draft.trim().replace(/\s+/g, " ").slice(0, 24);
    if (!w || coins.length >= coinMax) return;
    const known = vocabulary.find((v) => v.label.toLowerCase() === w.toLowerCase());
    if (known) { if (!picks.includes(known.id) && !full) toggle(known.id); }
    else if (!coins.some((c) => c.toLowerCase() === w.toLowerCase())) setCoins([...coins, w]);
    setDraft("");
  }

  return (
    <div className="space-y-4">
      <input type="hidden" name="words" value="1" />
      {picks.map((id) => <input key={id} type="hidden" name="pick" value={id} />)}
      {coins.map((c) => <input key={c} type="hidden" name="coin" value={c} />)}

      <p className="mono text-xs text-[var(--ink-faint)]">
        {picks.length} of {pickMax} chosen{coinMax > 0 ? ` · ${coins.length} of ${coinMax} of your own` : ""}
      </p>
      <ul className="flex flex-wrap gap-2" aria-label="Words to choose from">
        {vocabulary.map((w) => {
          const on = picks.includes(w.id);
          return (
            <li key={w.id}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => toggle(w.id)}
                disabled={!on && full}
                className={on ? "word word-on" : "word"}
              >
                {w.label}
              </button>
            </li>
          );
        })}
        {coins.map((c) => (
          <li key={c}>
            <button type="button" className="word word-on" aria-label={`Remove ${c}`} onClick={() => setCoins(coins.filter((x) => x !== c))}>
              {c} ×
            </button>
          </li>
        ))}
      </ul>
      {coinMax > 0 && coins.length < coinMax && (
        <div className="flex gap-2">
          <input
            className="field"
            value={draft}
            maxLength={24}
            placeholder="A word of your own"
            aria-label="A word of your own"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCoin(); } }}
          />
          <button type="button" className="button-quiet shrink-0" onClick={addCoin}>Add</button>
        </div>
      )}
    </div>
  );
}
