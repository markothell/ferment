"use client";

import { useState } from "react";
import { THEME_COOKIE, type Theme } from "@/lib/theme";

// Outside the component: React's rules don't let a component write globals.
function apply(t: Theme) {
  const root = document.querySelector<HTMLElement>(".ferment");
  if (t === "system") root?.removeAttribute("data-theme");
  else root?.setAttribute("data-theme", t);
  document.cookie = `${THEME_COOKIE}=${t}; path=/; max-age=31536000; samesite=lax`;
}

const CHOICES: [Theme, string, string][] = [
  ["system", "Match this device", "Light or dark, following your phone or computer."],
  ["light", "Light", "Plum ink on crumb."],
  ["dark", "Dark", "Cream ink on plum."],
];

/** Light, dark, or the device's own. Takes effect as soon as it's picked; no saving. */
export function ThemeSwitch({ initial }: { initial: Theme }) {
  const [theme, setTheme] = useState<Theme>(initial);
  return (
    <div className="space-y-3" role="radiogroup" aria-label="Theme">
      {CHOICES.map(([value, label, hint]) => (
        <label key={value} className="flex gap-3">
          <input
            type="radio"
            name="theme"
            value={value}
            checked={theme === value}
            onChange={() => {
              setTheme(value);
              apply(value);
            }}
            className="mt-1"
          />
          <span>
            <span className="block font-medium">{label}</span>
            <span className="block text-sm text-[var(--ink-soft)]">{hint}</span>
          </span>
        </label>
      ))}
    </div>
  );
}
