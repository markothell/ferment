// Hillside Tables, the example gathering behind /demo/gathering and its
// circles. From the review fixture in design/ferment/archive/gathering.html,
// filled in with the rounds each circle has shared. Read-only; no sign-in, no
// database. Dates count back from today so the example never goes stale.

import type { MapRound } from "@/lib/circleMap";

export const NAMES = ["Ama","Bo","Cleo","Dev","Esi","Finn","Gus","Hana","Ines","Jo","Kofi","Lena","Milo","Nia","Oren","Pia","Quin","Rae","Sol","Tam",
  "Uma","Vic","Wren","Xan","Yara","Zed","Ada","Ben","Cal","Dina","Eli","Fay","Gil","Hal","Ivy","Jun","Kit","Lou","May","Ned"];
export const personId = (i: number) => `p${i}`;

type Color = "saffron" | "moss" | "clay" | "plum" | "slate";

/** A round in a circle: answers by member index, in order; written ones say what they said. */
type DemoRound = { question: string; open?: boolean; answers: (number | [number, string])[] };

type DemoCircle = { id: string; name: string; color?: Color; members: number[]; forming?: boolean; rounds: DemoRound[] };

const DEMO: DemoCircle[] = [
  {
    id: "bread", name: "Bread", color: "saffron", members: [0, 1, 2, 3, 4, 5, 6, 7],
    rounds: [
      { question: "What bread did you grow up with?", answers: [0, 1, 2, 3, 4, 5, 6, 7] },
      { question: "Sourdough starters: share one, or each keep our own?", answers: [3, 0, 5, 6, 1] },
      { question: "Whose oven, which Saturday?", answers: [6, 2, 7, 0] },
      { question: "What's the worst loaf you're proud of?", answers: [1, 4, 5, 2, 3, 6] },
      { question: "Should we bake for the school fair?", answers: [2, 0, 7, 4, 1] },
      { question: "Rye, spelt, or stay with wheat this month?", answers: [5, 3, 6] },
      { question: "What do we do with the stale ends?", answers: [7, 1, 0, 4] },
      {
        question: "A bread from somewhere none of us have been?",
        answers: [
          [4, "Injera. Esi's neighbour offered to show us the teff, and I'd like to say yes before she changes her mind."],
          [0, "Something from Georgia, the boat-shaped one with the egg in the middle. Mostly I want an excuse to eat it."],
          [6, "Pan de muerto, if we can time it for November."],
          [2, "I'd rather learn one from a person than a book. Whoever we can find to teach us."],
        ],
      },
      {
        question: "Who should we teach next?",
        answers: [
          [1, "The kids on Birch Street keep watching through the window on Saturdays. Them."],
          [7, "Anyone who's been told they're no good with dough. That was me a year ago."],
          [3, "Fewer people, more often. Two at a time, so nobody hides at the back."],
          [5, "Whoever takes over the bakery on Main. We'll need them more than they need us."],
          [0, "My dad, honestly. He's lonely since he retired."],
        ],
      },
      {
        question: "What would a bread swap on the street look like?", open: true,
        answers: [
          [6, "A table outside the library, first Saturday of the month. Bring a loaf, take a loaf, no counting."],
          [0, "A shelf, not an event. Events need someone to run them, and then it's always the same someone."],
          [3, "I'd want a note with each loaf: who made it, and one thing about it."],
        ],
      },
    ],
  },
  {
    id: "walkers", name: "Walkers", color: "moss", members: [2, 12, 25, 26, 27],
    rounds: [
      { question: "Which walk would you show a visitor first?", answers: [2, 12, 25, 26, 27] },
      { question: "Mornings or evenings?", answers: [25, 2, 27] },
      {
        question: "Where does the path need us?",
        answers: [
          [12, "The steps down to the creek. Half of them are loose and nobody's going to fix them if we don't say something."],
          [26, "Signs. Every visitor gets lost at the fork past the water tower."],
          [2, "Less a place than a time: the path is empty after six, and it shouldn't feel that way."],
          [27, "The bench at the top fell over in the spring. I'd like to put it back."],
        ],
      },
    ],
  },
  {
    id: "tables", name: "Tuesday Tables", color: "clay", members: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
    rounds: [
      { question: "What should Tuesdays be for?", answers: [5, 6, 7, 8, 9, 10, 11, 12] },
      { question: "One pot, or everyone brings a dish?", answers: [9, 5, 13, 10, 6, 14] },
      { question: "How do we make room for someone new at the table?", answers: [11, 7, 8, 12, 5] },
      { question: "What food means home to you?", answers: [10, 13, 14, 6, 9, 7, 5, 8] },
      { question: "Cooking for allergies without making a fuss?", answers: [8, 12, 11] },
      { question: "Should kids eat with us or have their own table?", answers: [6, 9, 5, 13, 14] },
      { question: "What do we do with leftovers?", answers: [7, 10, 12, 8] },
      { question: "A dinner in silence: worth trying once?", answers: [13, 5, 11, 6, 9, 10] },
      { question: "How do we split costs fairly?", answers: [14, 8, 7, 12, 5, 6, 11] },
      { question: "What's a dish you've never managed to make?", answers: [9, 13, 10, 5] },
      { question: "Inviting the old Tuesday group back?", answers: [5, 6, 12, 7, 14] },
      { question: "Summer: outside, or keep the kitchen?", answers: [11, 9, 8, 13, 10] },
      {
        question: "What did this year's tables change for you?",
        answers: [
          [10, "I know the names of everyone on my floor now. That used to be two people."],
          [13, "I cook for more than one again. I'd stopped after Ma died."],
          [5, "I've learned to arrive early and leave late. The good talk is in the washing up."],
          [8, "Honestly, Tuesdays are the only night I'm not on my phone."],
        ],
      },
      {
        question: "Should we cook for the shelter once a month?",
        answers: [
          [12, "Yes, but let's ask them what they need first rather than turning up with lasagne."],
          [6, "Once a month is more than we can promise. Once a season, done properly."],
          [14, "I'll drive. I have the van until March."],
          [9, "I'd want some of us to eat there too, not just drop food and go."],
          [11, "Yes. We've been talking about doing something past ourselves for a while."],
        ],
      },
      {
        question: "Who's missing from our table?", open: true,
        answers: [
          [7, "The night shift nurses from the clinic. Tuesday's their one evening off and they eat alone."],
          [11, "Anyone over seventy. We say everyone's welcome, but we eat at eight and that's late for some."],
          [5, "People who can't cook and are embarrassed to say so. There's a job for everyone at a table."],
        ],
      },
    ],
  },
  {
    id: "parents", name: "New Parents", color: "plum", members: [15, 16, 17, 18, 19, 20],
    rounds: [
      { question: "What got you through the first week?", answers: [15, 16, 17, 18, 19, 20] },
      { question: "What do you wish someone had told you?", answers: [17, 20, 15, 19] },
      { question: "Swapping clothes: how do we keep it fair?", answers: [16, 18, 15] },
      { question: "What do you miss from before?", answers: [19, 17, 20, 16, 18] },
      {
        question: "Who watches whose kids on Thursdays?",
        answers: [
          [18, "I can take two at a time, mornings only. After lunch mine needs all of me."],
          [15, "Could we rotate houses? Then nobody's place is always the one with crayon on the walls."],
          [20, "I'd like to be on the list but I'm nervous about the babies under six months. Can I start with the walkers?"],
          [16, "Thursdays are my only office day, so I'll owe everyone. I can do Saturdays in return."],
        ],
      },
    ],
  },
  {
    id: "reading", name: "Reading", color: "slate", members: [18, 19, 20, 21, 22, 23, 24],
    rounds: [
      { question: "What are we reading first?", answers: [18, 19, 20, 21, 22, 23, 24] },
      { question: "A book you'd defend to anyone?", answers: [22, 18, 24, 20, 19] },
      { question: "Should we read in translation?", answers: [21, 23, 19, 22] },
      { question: "Poetry for a month: yes or no?", answers: [24, 20, 18, 21, 23, 22] },
      { question: "A book we all disliked: why?", answers: [19, 22, 20] },
      {
        question: "What did the summer list change for you?",
        answers: [
          [23, "I read a book about a river and then went and walked one. First time a book has done that to me."],
          [20, "I've started reading slower. Everyone else noticed things I raced past."],
          [21, "I finally finished something long. I'd been abandoning books for years."],
          [18, "It made me want to write down what I think, which I haven't done since school."],
        ],
      },
      {
        question: "Read one aloud together, a chapter a meeting?",
        answers: [
          [22, "Yes, and something old: it was written to be heard."],
          [24, "I'd love it, but I'd rather listen than read. Can I be the one who makes tea?"],
          [19, "Only if we choose something short. Our record with long books isn't great."],
        ],
      },
      {
        question: "What are we reading over the winter?", open: true,
        answers: [
          [21, "Something with snow in it. I want the weather outside and the book to agree."],
          [18, "One we'd never pick alone. Let's each suggest a book we're a little afraid of."],
          [24, "Short stories. Winter's busy, and a story fits in one evening."],
          [20, "Whatever Wren picks. Her choices have been the best of the year."],
        ],
      },
    ],
  },
  { id: "grief", name: "Grief", members: [28, 29], forming: true, rounds: [] },
];

const MONTH = 30 * 86_400_000;

/** The rounds a circle has shared, oldest first, spaced about a month apart up to now. */
function roundsOf(c: DemoCircle, now: number) {
  return c.rounds.map((r, i) => {
    const at = new Date(now - (c.rounds.length - 1 - i) * MONTH - 9 * 86_400_000);
    return {
      id: `r${i + 1}`,
      question: r.question,
      open: Boolean(r.open),
      at,
      closesAt: r.open ? new Date(now + 3 * 86_400_000) : null,
      answers: r.answers.map((a) => (Array.isArray(a) ? { by: a[0], text: a[1] } : { by: a, text: null })),
    };
  });
}

export function demoCircles(now = Date.now()) {
  return DEMO.map((c) => ({
    id: c.id,
    slug: c.id,
    name: c.name,
    color: c.color,
    forming: Boolean(c.forming),
    members: c.members,
    rounds: roundsOf(c, now),
  }));
}

export type DemoCircleView = ReturnType<typeof demoCircles>[number];

export function demoCircle(slug: string, now = Date.now()): DemoCircleView | null {
  return demoCircles(now).find((c) => c.slug === slug) ?? null;
}

/** For CircleMap: each round's author is its first answerer. */
export function mapRounds(c: DemoCircleView): MapRound[] {
  return c.rounds.map((r) => ({
    id: r.id,
    question: r.question,
    phase: r.open ? "open" : "closed",
    authorId: personId(r.answers[0]?.by ?? c.members[0]),
    responders: r.answers.map((a) => personId(a.by)),
    at: r.at,
    closesAt: r.closesAt,
  }));
}
