import type { Metadata } from "next";
import { CircleMap } from "@/components/app/CircleMap";
import { Top } from "@/components/app/Top";
import type { MapRound } from "@/lib/circleMap";

export const metadata: Metadata = { title: "A circle · ferment" };

// The review fixture from design/ferment/previews/circle.html: nine people,
// ten months in, with the replies from previews/replies.html branching off.
// Read-only; no sign-in.
const PEOPLE = ["Ama", "Bo", "Cleo", "Dev", "Esi", "Finn", "Gus", "Hana", "Ines"];
const PAST: [string, number, number[]][] = [
  ["How often should we meet?", 11, [2, 3, 0]],
  ["Ground rules for the group", 12, [0, 1, 2, 3, 4]],
  ["What are we reading first?", 1, [3, 4, 5]],
  ["Hosting: whose house, when?", 2, [1, 5, 8]],
  ["Should we open up to new members?", 3, [6, 7, 0, 2]],
  ["A book we all disliked", 4, [2, 3]],
  ["Our shared reading list", 5, [0, 1, 2, 3, 7, 8]],
  ["Summer: pause or keep going?", 6, [4, 6, 7, 8, 1]],
  ["A potluck for the street?", 7, [6, 7]],
  ["What do we want to become?", 8, [5, 6, 7, 8, 0, 1, 2]],
];
const id = (i: number) => `p${i}`;
const month = (m: number) => new Date(m >= 11 ? 2025 : 2026, m - 1, 15);

const ROUNDS: MapRound[] = [
  ...PAST.map(([question, m, who], i): MapRound => ({
    id: `r${i}`, question, phase: "closed", authorId: id(who[0]), responders: who.map(id), at: month(m), closesAt: null,
  })),
  {
    id: "live", question: "Where should we go next?", phase: "open", authorId: id(0),
    responders: [0, 3, 4, 6, 8].map(id), at: month(9), closesAt: new Date(Date.now() + 3 * 86_400_000),
  },
  { id: "s1", question: "A walk instead of a meeting?", phase: "nominated", authorId: id(4), responders: [], at: month(9), closesAt: null },
  { id: "s2", question: "Should we write something together?", phase: "queued", authorId: id(6), responders: [], at: month(9), closesAt: null },
  { id: "s3", question: "Who else should be here?", phase: "nominated", authorId: id(1), responders: [], at: month(9), closesAt: null },
  // Replies: a chain four deep off "new members" (folds on the map), and one of each state elsewhere.
  ...([
    ["m1", "r4", "What would have helped in your first month?", "closed", [7, 6, 0, 2, 1, 4], 3.5],
    ["m2", "m1", "Should every new person host once?", "closed", [1, 7, 2, 5], 4],
    ["m3", "m2", "Who hosts first this summer?", "closed", [7, 1, 8], 5],
    ["m4", "m3", "How did your first time hosting go?", "closed", [5, 7, 0, 2], 7],
    ["l1", "r6", "What did the list change for you?", "closed", [2, 3, 0, 8], 6],
    ["g1", "r9", "What would a garden on Elm need from us?", "open", [6, 0, 7], 9],
    ["d1", "r9", "Less of a club: what would that look like?", "nominated", [], 9],
    ["c1", "live", "The coast: one night or two?", "queued", [], 9],
  ] as const).map(([rid, replyTo, question, phase, who, m]): MapRound => ({
    id: rid, question, phase, replyTo, authorId: id(who[0] ?? 3), responders: who.map(id), at: month(m), closesAt: null,
  })),
];

export default function DemoCircle() {
  return (
    <>
      <Top trail={[{ label: "A circle, ten months in" }]} />
      <main className="mx-auto max-w-2xl space-y-6 px-4 py-8">
        <CircleMap
          seats={PEOPLE.map((name, i) => ({ id: id(i), name }))}
          rounds={ROUNDS}
          roundBase="/demo/circle"
          label="A circle of nine people. The rounds they shared spiral in to the question open now; replies branch off the rounds they answer; three suggestions wait at the edge."
        />
        <p className="text-center text-sm text-[var(--ink-soft)]">Hover or tap a round. The smaller branches are replies.</p>
      </main>
    </>
  );
}
