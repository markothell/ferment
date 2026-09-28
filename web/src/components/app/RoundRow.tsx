import Link from "next/link";
import { relative } from "@/lib/time";

export type RoundRowData = {
  id: string; phase: string; question: string; responded: number; respondedByMe: boolean;
  closesAt: Date | null; closedAt?: Date | null;
};

/** One question in a list: open ones are live and ask for your answer. */
export function RoundRow({ round, href, expected }: { round: RoundRowData; href: string; expected?: number | null }) {
  const open = round.phase === "open";
  return (
    <li>
      <Link href={href} className="card block space-y-2">
        <span className={open ? "label live flex items-center gap-2" : "label"}>
          {open && <span className="dot-live" aria-hidden />}
          {open ? (round.closesAt ? `open · closes ${relative(round.closesAt)}` : "open") : "closed"}
        </span>
        <p className="text-lg leading-snug">{round.question}</p>
        <p className="mono text-sm text-[var(--ink-soft)]">
          {round.responded}{expected ? ` of ${expected}` : ""} shared
          {round.respondedByMe ? " · you shared" : open ? " · your turn" : ""}
        </p>
      </Link>
    </li>
  );
}
