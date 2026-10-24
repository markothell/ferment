import type { Metadata } from "next";
import type { FeedItem } from "@/domain/feed";
import { FeedList } from "@/components/app/FeedList";
import { Top } from "@/components/app/Top";

export const metadata: Metadata = { title: "What we're talking about · ferment" };

// The review fixture from design/ferment/archive/gathering.html. Read-only.
// `beyond` and `arrived` are the unbuilt platform-level spread, shown here as the concept.
const c = (id: string, name: string, open = false, viaAdaptation = false) => ({ id, slug: id, name, open, first: null, viaAdaptation });
const base = {
  context: "", author: "Pia", adaptedFrom: null, adaptations: [], replies: [], total: 5, everyone: null, openIn: 0,
  startedAt: new Date(2026, 7, 1), lastActivity: new Date(2026, 8, 1), beyond: 0, arrived: false, suggestable: [], harvests: [],
} satisfies Partial<FeedItem>;
const ITEMS: FeedItem[] = [
  { ...base, promptId: "welcome", question: "What are you learning right now?", circles: [], here: 5, everyone: { roundId: "w", open: true, answered: 26 }, beyond: 6, arrived: true, startedIn: null },
  { ...base, promptId: "owe", question: "What do we owe our neighbours?", author: "Kofi", here: 4, openIn: 1, beyond: 3,
    circles: [c("tables", "Tuesday Tables"), c("bread", "Bread"), c("parents", "New Parents"), c("reading", "Reading", true)], startedIn: { name: "Tuesday Tables", slug: "tables" } },
  { ...base, promptId: "fed", question: "What fed you this week?", here: 3, openIn: 1, beyond: 11, arrived: true,
    harvests: [{ id: "h-bread", circleName: "Bread", circleColor: "saffron", shared: 4 }, { id: "h-walkers", circleName: "Walkers", circleColor: "moss", shared: 3 }],
    replies: [
      { roundId: "fed-r1", question: "Who cooked it?", open: false, circle: { slug: "bread", name: "Bread" } },
      { roundId: "fed-r2", question: "What would you cook for us?", open: true, circle: { slug: "tables", name: "Tuesday Tables" } },
    ],
    circles: [c("bread", "Bread"), c("tables", "Tuesday Tables", true), c("walkers", "Walkers")], startedIn: { name: "Bread", slug: "bread" } },
  { ...base, promptId: "hard", question: "Who do you call when it's hard?", author: "Rae", here: 3,
    harvests: [{ id: "h-parents", circleName: "New Parents", circleColor: "plum", shared: 5 }],
    adaptations: [{ id: "stuck", question: "Who do you call when you're stuck?" }],
    circles: [c("parents", "New Parents"), c("reading", "Reading"), c("walkers", "Walkers", false, true)], startedIn: { name: "New Parents", slug: "parents" } },
  { ...base, promptId: "stuck", question: "Who do you call when you're stuck?", author: "Sol", here: 2, beyond: 1,
    adaptedFrom: { id: "hard", question: "Who do you call when it's hard?" },
    circles: [c("reading", "Reading"), c("walkers", "Walkers")], startedIn: { name: "Reading", slug: "reading" } },
  { ...base, promptId: "book", question: "A book that changed your mind", here: 1, circles: [c("reading", "Reading")], startedIn: { name: "Reading", slug: "reading" } },
];

export default function DemoFeed() {
  return (
    <>
      <Top trail={[{ label: "Hillside Tables, an example" }, { label: "What we're talking about" }]} />
      <main className="mx-auto max-w-2xl space-y-6 px-4 py-8">
        <h1 className="display text-4xl">What we&apos;re talking about</h1>
        <FeedList items={ITEMS} gathering="demo" actions={false} circleHref={(slug) => `/demo/gathering/circles/${slug}`} />
      </main>
    </>
  );
}
