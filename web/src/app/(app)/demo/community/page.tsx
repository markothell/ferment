import type { Metadata } from "next";
import { CommunityMap } from "@/components/app/CommunityMap";
import { Top } from "@/components/app/Top";

export const metadata: Metadata = { title: "A community · ferment" };

// The review fixture from design/ferment/previews/community.html. Read-only; no sign-in.
const NAMES = ["Ama","Bo","Cleo","Dev","Esi","Finn","Gus","Hana","Ines","Jo","Kofi","Lena","Milo","Nia","Oren","Pia","Quin","Rae","Sol","Tam",
  "Uma","Vic","Wren","Xan","Yara","Zed","Ada","Ben","Cal","Dina","Eli","Fay","Gil","Hal","Ivy","Jun","Kit","Lou","May","Ned"];
const id = (i: number) => `p${i}`;
const CIRCLES = [
  { id: "bread", name: "Bread", members: [0, 1, 2, 3, 4, 5, 6, 7], explored: 9, open: 1 },
  { id: "walkers", name: "Walkers", members: [2, 12, 25, 26, 27], explored: 3, open: 0 },
  { id: "tables", name: "Tuesday Tables", members: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14], explored: 14, open: 1 },
  { id: "parents", name: "New Parents", members: [15, 16, 17, 18, 19, 20], explored: 5, open: 0 },
  { id: "reading", name: "Reading", members: [18, 19, 20, 21, 22, 23, 24], explored: 7, open: 1 },
  { id: "grief", name: "Grief", members: [28, 29], explored: 0, open: 0, forming: true },
].map((c) => ({ ...c, slug: c.id, forming: Boolean(c.forming), members: c.members.map(id) }));

export default function DemoCommunity() {
  return (
    <>
      <Top trail={[{ label: "Hillside Tables, an example" }]} />
      <main className="mx-auto max-w-2xl space-y-6 px-4 py-8">
        <CommunityMap
          people={NAMES.map((name, i) => ({ id: id(i), name }))}
          circles={CIRCLES}
          openQuestions={2}
          answerers={NAMES.map((_, i) => id(i)).filter((_, i) => (i * 7) % 3 !== 0).slice(0, 26)}
          viewerId={id(6)}
          base="/demo/community"
          label="Forty people on an outer ring, gathered into six circles, with two open questions at the center."
        />
        <p className="text-center text-sm text-[var(--ink-soft)]">Hover or tap a circle, a person, or the center.</p>
      </main>
    </>
  );
}
