import { cookies } from "next/headers";
import { THEME_COOKIE, savedTheme } from "@/lib/theme";
import "./app.css";
import "./circles.css";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const theme = savedTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <div
      className="ferment flex flex-col"
      data-theme={theme === "system" ? undefined : theme}
    >
      <div className="flex-1">{children}</div>
      <footer className="mx-auto w-full max-w-2xl px-4 pt-10 pb-6">
        <span className="text-sm text-[var(--ink-faint)]">ferment.earth</span>
      </footer>
    </div>
  );
}
