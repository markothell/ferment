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

Sample pages that need no sign-in: `/demo/circle`, `/demo/community`, `/demo/feed`.

## Layout

- `src/db/schema/` — every table. `auth.ts` is Better Auth's; `app.ts` is Ferment's.
- `drizzle/` — generated SQL migrations. After changing the schema: `npm run db:generate`.
- `src/db/testing.ts` — `testDb()`: a fresh migrated in-memory database per test.
- `src/lib/auth.ts` — Better Auth, email link only. `src/lib/access.ts` decides who may get a
  link (invite-only: an account, a live invitation, or `FERMENT_HOST_EMAILS`).
- `src/app/(app)/` — the app, in the Culture palette (`app.css`, scoped to `.ferment`).
- `src/app/page.tsx` and `src/components/` — the draft lander, still on the Toono tokens.

Domain functions take the database as an argument (`db: DB`) so tests can pass `testDb()`.
