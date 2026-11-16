# ferment — web

The app and the draft lander. Plan: `docs/plan/ferment/PLAN.md` (from the repo root:
`../../docs/plan/ferment/PLAN.md`). Design reference: `../design/ferment/`.

```bash
cp .env.example .env.local   # then set BETTER_AUTH_SECRET and FERMENT_HOST_EMAILS
npm run dev                  # http://localhost:3000
npm test                     # vitest, against an in-memory Postgres
```

Nothing else to install. With no `DATABASE_URL`, the app runs on an embedded Postgres (PGlite)
in `.data/`, migrated at startup. With no `RESEND_API_KEY`, sign-in links and other mail print
to the dev server console and are appended to `.data/outbox.log`. With no `BLOB_READ_WRITE_TOKEN`,
voice recordings are saved to `.data/audio`. With no `DEEPGRAM_API_KEY`, recordings play without
a transcript.

The clock (`lib/tick.ts`: timers, lapsed proposals, notification email, pending transcripts) runs every minute in
`npm run dev`. In production an outside scheduler (cron-job.org) calls `/api/cron` every 15 minutes
with `Authorization: Bearer $CRON_SECRET`; `vercel.json` adds a daily run as a backstop, the most
the Hobby plan allows.

Pages that need no sign-in: the library of starters (`/library`, `/library/<slug>`), and the samples
`/demo/circle`, `/demo/gathering`, `/demo/feed`.

Our own starters are `starters/*.json`. `npm run dev` loads them into the local store at start;
elsewhere, run `npm run starters:load` after `npm run db:migrate`.

**One process per local store.** Only one process may open `.data/pglite`. A second handle
writes its own checkpoint while the first keeps writing over it, and after the next hard stop
PGlite refuses to open with "could not locate a valid checkpoint record" (it ships no
`pg_resetwal`). That is how the store broke before 2026-11-16: `next dev` imports every dynamic
route in a throwaway worker, and the store used to open on import. Now it opens on first use,
and `.data/pglite.lock` holds the owner's pid so any second opener stops with an error;
`db:migrate`, `db:studio` and `starters:load` refuse to run against it while the dev server
holds it. Stop the server with Ctrl-C. If a store is ever lost anyway, rebuild it: move
`.data/pglite` aside, then `npm run db:migrate` and `npm run starters:load`.

## Layout

- `src/db/schema/` — every table. `auth.ts` is Better Auth's; `app.ts` is Ferment's. A circle and a
  gathering are two kinds of one `groups` row (`docs/plan/ferment/GROUPS.md`); `src/lib/kinds.ts`
  says what each kind may do.
- `drizzle/` — generated SQL migrations. After changing the schema: `npm run db:generate`.
- `src/db/testing.ts` — `testDb()`: a fresh migrated in-memory database per test.
- `src/lib/auth.ts` — Better Auth, email link only. `src/lib/access.ts` decides who may get a
  link: anyone, capped per address and across new addresses. `FERMENT_HOST_EMAILS` names the
  curators, who may publish starters to the library.
- `src/domain/starters.ts` — starters and their lineage (`docs/plan/ferment/STARTERS.md`).
- `src/app/(app)/` — the app, in the Culture palette (`app.css`, scoped to `.ferment`).
- `src/app/page.tsx` and `src/components/` — the draft lander, still on the Toono tokens.

Domain functions take the database as an argument (`db: DB`) so tests can pass `testDb()`.
