# ferment: design direction (draft)

This is where the look for ferment.earth stands. It isn't a design system yet, and `web/` doesn't use any of it.
Open the files in `previews/` in a browser. They load fonts from Google Fonts.

## Decided

- **Name:** ferment. It's always lowercase, in Hanken Grotesk 500 with tracking at -0.035em.
- **Logo, "Rising":** two overlapping arcs in ink with three saffron thoughts rising above them, slightly off-center.
  The arcs are two circles of people, and their overlap also makes the "m". Files are in `logo/` (light, dark, and a `currentColor` mono version).
  The logo never uses the live green.
- **Palette, "Culture":** light and dark, in `palette.css`. Biology is a hint here, and the palette should read as social first.
- **Type:** Instrument Serif for headlines only. Hanken Grotesk for the wordmark, body text, UI and initials. Geist Mono for counts and states.
- **Lander hero:** type and space only, with no drawing and no animation. The headline is two lines, with "community" in italic green:
  > How people
  > become *community*.
- **Circle map:** same grammar as the Toono version, recolored (see `previews/circle.html`):

  | Toono | Culture | Means |
  |---|---|---|
  | card | `--raised` | a seat |
  | shared + rope | `--shared-soft` fill, `--shared` outline | explored together |
  | ochre | `--mine` | one person's idea, waiting |
  | sky | `--live` | open now, the only green |

  By default, the activities are linked by one loose spiral thread of straight segments (curves looked wrong) in the order they happened, from the oldest on the outside to the open question at the center. Participation lines always show faintly (10%). Hovering or focusing an activity brings its lines to full strength in its own color. Other activities ease back slightly, seats never dim, and there's no extra hover outline. The Toono crown ring is dropped.

## Color rules

- `--live` is only for things that are open right now. The headline's italic green borrows it. That's the one known exception, and it's still open to change.
- `--mine` is you, or one person's mark.
- `--shared` is what the group made together. That covers the logo's thoughts and explored nodes.

## Tried and dropped

- The Mycelium direction, a dark ground with amber threads. Too harsh.
- A leaning beaker, and vessel/jar versions of the logo.
- Human figures in the logo, both with bubbles as heads and with the arcs as heads. Too ambiguous.
- Seat tallies on the circle map (a dot per activity joined).
- A hero illustration: first a jar with rising bubbles, then an interactive map. Too busy. The hero should have room to breathe.

## Still open

- Whether the headline's green italic should become ink.
- Tokens, type scale and components, whenever this becomes a real system.
