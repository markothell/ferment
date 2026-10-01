"use client";

import { useState } from "react";
import { THEME_COOKIE, type Theme } from "@/lib/theme";

/** Temporary, while we build: pick light or dark instead of following the system. */
export function ThemeSwitch({ initial }: { initial: Theme }) {
  const [theme, setTheme] = useState<Theme>(initial);
  const pick = (t: Theme) => {
    setTheme(t);
    const root = document.querySelector<HTMLElement>(".ferment");
    if (t === "system") root?.removeAttribute("data-theme");
    else root?.setAttribute("data-theme", t);
    document.cookie = `${THEME_COOKIE}=${t}; path=/; max-age=31536000; samesite=lax`;
  };
  return (
    <div className="theme-switch mono flex items-center justify-center gap-3 text-xs" role="group" aria-label="Theme">
      <span className="text-[var(--ink-faint)]">theme</span>
      {(["system", "light", "dark"] as const).map((t) => (
        <button key={t} type="button" aria-pressed={theme === t} onClick={() => pick(t)}>
          {t}
        </button>
      ))}
    </div>
  );
}
