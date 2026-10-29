"use client";

import { useState } from "react";

/** A value to carry elsewhere, with a copy button; falls back to selecting it. */
export function CopyLine({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex gap-2">
      <input
        className="field mono flex-1 text-sm"
        readOnly
        value={value}
        aria-label={label}
        onFocus={(e) => e.currentTarget.select()}
      />
      <button
        type="button"
        className="button-quiet shrink-0"
        onClick={async (e) => {
          const input = e.currentTarget.previousElementSibling as HTMLInputElement | null;
          try {
            await navigator.clipboard.writeText(value);
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          } catch {
            input?.focus();
            input?.select();
          }
        }}
      >
        {done ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
