import Link from "next/link";
import type { StarterCard as Card } from "@/domain/starters";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** A starter in a list: what it is, how big, and how far it has gone. */
export function StarterCard({ s, href = `/library/${s.slug}`, showVisibility = false }: { s: Card; href?: string; showVisibility?: boolean }) {
  const counts = [
    s.circles ? plural(s.circles, "circle") : null,
    plural(s.questions, "question"),
    s.started ? `started ${plural(s.started, "gathering")}` : null,
  ].filter(Boolean);
  return (
    <Link href={href} className="card block space-y-2 hover:border-[var(--rule-strong)]">
      <span className="flex items-baseline justify-between gap-3">
        <span className="display text-2xl">{s.title}</span>
        {showVisibility && <span className="label shrink-0">{s.visibility === "published" ? "in the library" : "yours"}</span>}
      </span>
      {s.summary && <span className="block text-[var(--ink-soft)]">{s.summary}</span>}
      <span className="label block">{s.fromFerment ? "from ferment" : `by ${s.by}`} · {counts.join(" · ")}</span>
    </Link>
  );
}
