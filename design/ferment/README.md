# ferment: design direction

The look for ferment.earth. It's built into `web/`: the palette and type are in
`web/src/app/ferment.css`, the homepage in `web/src/app/page.tsx`. `palette.css` here is the
reference copy. The review sheets that got us here are in `archive/`; they load fonts from
Google Fonts and open in a browser.

## Attitude: juicy, not clever

The name carries the metaphor. Everything else just tastes like it.

- **Warm.** Kitchen and table, not lab and bench. Crust, honey, beet and brine, with a grain
  on the ground like flour on a counter.
- **Generous.** Big type, room to breathe. Say things plainly and specifically:
  "Tuesday Tables," not "your group."
- **Alive.** Handmade, but steady. What's open now is the only thing that changes colour.

**Words.** Reach for everyday kitchen and table words: table, feed, keep, pass on, bring, open,
chew on. Use culture, starter, rise, jar and ferment rarely, only where they're true. Never:
puns, winks, emoji telling the joke, or explaining the metaphor. The look can be juicy; the
words shouldn't say so. The table of examples is in `archive/juicy.html`.

## Decided

- **Name:** ferment, always lowercase, in Hanken Grotesk 500 with tracking at -0.035em.
- **Address:** ferment.earth. It's the domain, not the mark: the wordmark stays "ferment",
  the name people say. The address sits where people type or share it: the homepage footer,
  the app footer, and the end of every email.
- **Logo, "Rising":** two overlapping arcs in ink with three saffron thoughts rising above
  them, slightly off-center. The arcs are two circles of people, and their overlap makes the
  "m". Files are in `logo/` (light, dark, and a `currentColor` mono version). Never the live
  green.
- **Palette, "Starter"** (`palette.css`): crumb ground, cream raised surfaces, plum-black ink,
  saffron, beet, and verdigris for what's open. Light and dark. A fine grain on the ground.
- **Type:** Fraunces for headlines, set soft and a little wonky (SOFT 100, WONK 1), weight
  520 in the app and 560 on the homepage, with italic kept for one word. Hanken Grotesk for
  the wordmark, body, UI and initials. Geist Mono for counts, states and small labels, in
  lowercase.
- **Shapes stay exact.** Circles are circles and lines are straight. Starter changed the
  colour and type only; the wobbly shapes and bubble animation were tried and dropped.
- **Homepage** (`archive/home.html`, where openers are collected newest first):
  - The opener, arriving one line at a time: "We shape the world with our ideas. / We shape
    our ideas with each other." then "Culture is grown in *conversation*." (conversation in
    saffron italic) then "This is where you pass it on." The quiet lines bookend the headline.
  - Two ways in: **Start a conversation** (beet) and **Look in on open circles**.
  - "How it grows", five steps told at the social level, with one drawing in ink and saffron
    only: invite your people; pick what matters (from life or the library); gather in
    circles of 4–12; share with the community; pass it on.
  - Its first readers are people who were invited. It doesn't name workshops and doesn't
    pitch.
- **Circle map:** same grammar as the Toono version, recoloured (`archive/circle.html`):

  | Toono | Starter | Means |
  |---|---|---|
  | card | `--raised` | a seat |
  | shared + rope | `--shared-soft` fill, `--shared` outline | explored together |
  | ochre | `--mine` | one person's idea, waiting |
  | sky | `--live` | open now, the only green |

  The activities are linked by one loose spiral thread of straight segments, oldest outside to
  the open question at the center. Participation lines show faintly (10%); focusing an
  activity brings its lines to full strength in its own colour.
- **Circle colours:** the host picks saffron, clay, moss, slate or plum. Never verdigris or beet.

## Color rules

- `--live` is only for things that are open right now.
- `--mine` is you, or one person's mark. On the homepage, beet also fills the main button.
  Inside the app, buttons are ink.
- `--shared` is what the group made together: the logo's thoughts, explored nodes, the
  homepage drawing, and the homepage headline's two highlighted words. Small text is never
  saffron; put a saffron mark beside ink text instead.

## Tried and dropped

- The Mycelium direction (a dark ground with amber threads). Too harsh.
- The Culture palette (agar ground, brine ink) with Instrument Serif. Careful, but it read as
  a lab, not a kitchen.
- Kitchen table (Culture warmed through) as too timid; Preserves (a jar colour per circle) as
  breaking the colour rules.
- Wobbly bubble shapes, rising-bubble animation, a glow behind the hero.
- A rotating headline carousel; the opener arrives once and stays instead.
- The big wordmark between the lead lines and the headline. It looked wrong in the middle.
- Every other opener we tried is kept in `archive/home.html`.
- A leaning beaker, vessel and jar versions of the logo; human figures in the logo.
- Seat tallies on the circle map; a hero illustration.

## Still open

- Where "Look in on open circles" goes, and what an outsider may see there (the name, the
  question and open seats, never answers?). It points at the sample community for now.
- "Start a conversation" points at community setup until there's a lighter first step.
