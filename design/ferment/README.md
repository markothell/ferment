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
- **Homepage** (decided 2026-10-23; the review page is the "Ferment Homepage Scroll" artifact,
  https://claude.ai/artifact/RTKgBCe3WY2ufbhivRP4nD; `archive/home.html` keeps the earlier
  openers):
  - Six beats scroll past one drawing that sticks beside them (`components/home/Story.tsx`,
    geometry in `lib/storyScene.ts`). The drawing opens and closes on the mark with "ferment"
    under it; between, the same eight people are rearranged: a story passed along a line, a
    field of circles, one circle, a web of gatherings with a question crossing it.
  - The beats: "We make the world with our ideas. / We make our ideas with each other." then
    "Culture is *stories*." with three questions under it (who are we, what do we want, what are
    we going to do about it); "Certain stories transform our world."; "It starts with a
    *circle*."; "Good questions travel."; "Culture is grown in *conversation*. / This is where
    you pass it on." with the two ways in: **Start a conversation** (beet) and **Browse starters**.
  - Under the story, **where to start**: Start a circle and Host a gathering side by side, each
    with a small drawing. Both lead to `/new` for now; a lighter path for a circle is still to
    be designed. Then **inspired by**: a nod to pioneers in human process (Microsolidarity, Imago
    dialogue, Internal Family Systems, Presencing Institute, sharing circles), what each
    revealed, and a link to holoscopic.io.
  - No app words before the buttons: "starter" appears only on the Browse starters button. The
    privacy promise is said plainly instead ("never what anyone said"). It doesn't pitch.
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

- What an outsider may see of a real gathering. The homepage's second way in is now "Browse
  starters" (`/library`, 2026-10-19), with the sample gathering linked from there.
