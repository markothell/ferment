import Link from "next/link";
import { GatheringGlyph } from "./Glyph";

export type GatheringTab = "home" | "feed" | "circles" | "people";

const TABS: { tab: GatheringTab; label: string; path: string }[] = [
  { tab: "home", label: "Home", path: "" },
  { tab: "feed", label: "Feed", path: "/feed" },
  { tab: "circles", label: "Circles", path: "/circles" },
  { tab: "people", label: "People", path: "/people" },
];

/** The gathering's name with its ring glyph, and the tabs under it. */
export function GatheringHeader({ name, slug, tab, children }: { name: string; slug: string; tab: GatheringTab; children?: React.ReactNode }) {
  return (
    <header className="space-y-5">
      <div className="flex items-center gap-4">
        <GatheringGlyph size={44} />
        <div className="min-w-0">
          <span className="label">your gathering</span>
          <h1 className="display truncate text-4xl leading-tight">{name}</h1>
        </div>
      </div>
      {children}
      <nav aria-label={`${name} sections`} className="flex gap-6 border-b border-[var(--rule)]">
        {TABS.map((t) => (
          <Link
            key={t.tab}
            href={`/g/${slug}${t.path}`}
            aria-current={t.tab === tab ? "page" : undefined}
            className={`-mb-px border-b-2 pb-2 text-sm ${t.tab === tab ? "border-[var(--ink)] text-[var(--ink)]" : "border-transparent text-[var(--ink-soft)] hover:text-[var(--ink)]"}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
