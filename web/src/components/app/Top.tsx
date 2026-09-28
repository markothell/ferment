import Link from "next/link";

/** The bar at the top of every app screen: the wordmark, and where you are. */
export function Top({ here, links = [] }: { here?: { label: string; href: string }; links?: { label: string; href: string }[] }) {
  return (
    <header className="mx-auto flex max-w-2xl items-center gap-3 px-4 pt-5 pb-2">
      <Link href="/home" className="text-lg font-medium tracking-tight">ferment</Link>
      {here && (
        <>
          <span className="text-[var(--ink-faint)]">/</span>
          <Link href={here.href} className="truncate text-[var(--ink-soft)]">{here.label}</Link>
        </>
      )}
      <nav className="ml-auto flex gap-4 text-sm">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="link">{l.label}</Link>
        ))}
      </nav>
    </header>
  );
}
