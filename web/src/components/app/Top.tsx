import Link from "next/link";

export type Crumb = { label: string; href?: string };

/** The bar at the top of every app screen: ferment / community / circle / here. */
export function Top({ trail = [], links = [] }: { trail?: Crumb[]; links?: { label: string; href: string }[] }) {
  return (
    <header className="mx-auto flex max-w-2xl items-center gap-3 px-4 pt-5 pb-2">
      <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
        <ol className="flex min-w-0 items-center gap-2">
          <li className="shrink-0">
            <Link href="/home" className="text-lg font-medium tracking-tight">ferment</Link>
          </li>
          {trail.map((c, i) => (
            <li key={i} className="flex min-w-0 items-center gap-2">
              <span className="text-[var(--ink-faint)]" aria-hidden>/</span>
              {c.href ? (
                <Link href={c.href} className="truncate text-[var(--ink-soft)] hover:text-[var(--ink)]">{c.label}</Link>
              ) : (
                <span className="truncate text-[var(--ink-faint)]" aria-current="page">{c.label}</span>
              )}
            </li>
          ))}
        </ol>
      </nav>
      {links.length > 0 && (
        <nav className="flex shrink-0 gap-4 text-sm">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="link">{l.label}</Link>
          ))}
        </nav>
      )}
    </header>
  );
}
