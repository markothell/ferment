import { PROJECT_NAME } from "@/lib/brand";
import { Becoming } from "@/components/Becoming";
import { HeroCircle } from "@/components/HeroCircle";
import { HowItWorks } from "@/components/HowItWorks";
import {
  EveryVoice, OwnTime, WhereYouStand, KeepIt,
  KeySeat, KeySpur, KeyShared, KeyLive,
} from "@/components/Glyphs";

// DRAFT landing. The calls to action point at "#" until there is somewhere for
// them to go.
const START_HREF = "#start";
const SAMPLE_HREF = "#how";

const NEEDS = [
  {
    Glyph: EveryVoice,
    title: "Everyone gets heard.",
    body: "Answers stay sealed until everyone has had their say. Nobody has to go first, and nobody sets the tone for the room.",
  },
  {
    Glyph: OwnTime,
    title: "On your own time.",
    body: "No meeting to schedule. Answer out loud or in writing, whenever it suits you, while the question is open.",
  },
  {
    Glyph: WhereYouStand,
    title: "See where you stand.",
    body: "Answers come back as a picture, not a pile of messages. You can see agreement, disagreement and outliers at a glance.",
  },
  {
    Glyph: KeepIt,
    title: "Keep what you make.",
    body: "Every question a circle explores stays on its map. Over time it becomes a record of what you've thought through together.",
  },
];

const KEY = [
  { Mark: KeySeat, title: "A seat", body: "Everyone sits on the ring. Nobody sits at the head of it." },
  { Mark: () => <KeySpur />, title: "An idea, waiting", body: "Someone put it forward. Nobody has joined yet." },
  { Mark: () => <KeySpur queued />, title: "The circle said yes", body: "It's been accepted and is waiting its turn." },
  { Mark: KeyShared, title: "Explored together", body: "Sized by how many took part, and drawn toward the people who did." },
  { Mark: KeyLive, title: "Happening now", body: "The only blue on the map. Something is open, and you can still add to it." },
];

const WHO = [
  "neighborhood groups",
  "reading & study circles",
  "faith communities",
  "co-ops & collectives",
  "mutual aid networks",
  "teams",
  "families & old friends",
  "organizers & their people",
];

function Wordmark() {
  return (
    <span className="flex items-center gap-2 text-[19px] font-medium text-ink">
      <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
        <circle cx="10" cy="10" r="8" fill="none" stroke="var(--ink)" strokeWidth="1.4" />
        <circle cx="10" cy="10" r="3" fill="var(--shared)" stroke="var(--rope)" strokeWidth="1.2" />
      </svg>
      {PROJECT_NAME}
    </span>
  );
}

function Action({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} className="inline-block rounded-full bg-ink px-5 py-2.5 text-[15px] text-card transition-opacity hover:opacity-85">
      {children}
    </a>
  );
}

function Quiet({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} className="text-[15px] text-ink-soft underline underline-offset-4 hover:text-ink">
      {children}
    </a>
  );
}

function Band({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-8 border-t border-rule pt-3 text-xs font-semibold tracking-[0.16em] text-ink-faint uppercase">
      {children}
    </p>
  );
}

export default function Home() {
  return (
    <div className="overflow-x-clip">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 pt-6 sm:px-6">
        <Wordmark />
        <nav className="flex items-center gap-5 text-sm text-ink-soft">
          <a href="#how" className="hidden hover:text-ink sm:inline">How it works</a>
          <a href="#start" className="hover:text-ink">Start a circle</a>
        </nav>
      </header>

      {/* ——— Hero ——— */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pt-14 pb-16 sm:px-6 md:grid-cols-[1.05fr_1fr] md:pt-20 md:pb-24">
        <div>
          <Becoming />
          <p className="mt-6 max-w-lg text-[18px] leading-relaxed text-ink-soft">
            A circle is a small group of people who think things through together —
            each on their own time, every voice counted the same. Bring a question.
            See who joins. Share what you find with everyone around you.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-6">
            <Action href={START_HREF}>Start a circle</Action>
            <Quiet href={SAMPLE_HREF}>See how it works</Quiet>
          </div>
        </div>
        <HeroCircle />
      </section>

      {/* ——— The need ——— */}
      <section className="mx-auto max-w-6xl px-4 pb-10 sm:px-6">
        <Band>What a community needs</Band>
        <div className="grid gap-12 md:grid-cols-[1fr_1.4fr] md:gap-20">
          <div>
            <h2 className="text-3xl leading-tight md:text-[2.5rem]">
              Your community already thinks. It rarely gets to think <em>together</em>.
            </h2>
            <p className="mt-5 max-w-md text-[17px] leading-relaxed text-ink-soft">
              Group chats move too fast. Meetings go to whoever speaks first. Big
              questions get raised and then dropped. A circle gives a group a slower,
              fairer place to work something out, and a way to remember what it found.
            </p>
          </div>
          <ul className="grid gap-x-10 gap-y-10 sm:grid-cols-2">
            {NEEDS.map(({ Glyph, title, body }) => (
              <li key={title}>
                <Glyph />
                <h3 className="mt-3 text-xl">{title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">{body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ——— How it works: the notebook sketch, told in five steps ——— */}
      <div className="mx-auto mt-16 max-w-6xl px-4 sm:px-6">
        <Band>How a circle works</Band>
      </div>
      <HowItWorks />

      {/* ——— Reading a circle ——— */}
      <section className="mx-auto max-w-6xl px-4 pt-10 pb-20 sm:px-6">
        <Band>Reading a circle</Band>
        <div className="grid items-start gap-12 md:grid-cols-[1fr_1.2fr] md:gap-20">
          <div>
            <h2 className="text-3xl leading-tight md:text-[2.5rem]">The circle, seen whole.</h2>
            <p className="mt-5 max-w-md text-[17px] leading-relaxed text-ink-soft">
              Every circle has a map. At a glance it shows who&rsquo;s in it, what
              you&rsquo;ve explored together, what&rsquo;s been put forward, and
              what&rsquo;s open right now. You don&rsquo;t have to scroll back
              through anything to catch up.
            </p>
          </div>
          <ul className="divide-y divide-rule border-y border-rule">
            {KEY.map(({ Mark, title, body }) => (
              <li key={title} className="flex items-center gap-5 py-4">
                <Mark />
                <div>
                  <p className="text-[16px] font-medium text-ink">{title}</p>
                  <p className="text-[15px] leading-snug text-ink-soft">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ——— Who for ——— */}
      <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        <Band>Who it&rsquo;s for</Band>
        <h2 className="max-w-3xl text-3xl leading-tight md:text-[2.5rem]">
          For groups that are becoming something.
        </h2>
        <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-ink-soft">
          Five people or fifty. A circle works best with the people you already
          have, and gets more useful the longer you keep it going.
        </p>
        <ul className="mt-8 flex flex-wrap gap-2.5">
          {WHO.map((w) => (
            <li key={w} className="rounded-full border border-[var(--rule-strong)] px-4 py-1.5 text-[16px] text-ink"
              style={{ fontFamily: "var(--font-display)" }}>
              {w}
            </li>
          ))}
        </ul>
      </section>

      {/* ——— Invitation ——— */}
      <section id="start" className="bg-ground-deep">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-8 px-4 py-20 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div className="max-w-xl">
            <h2 className="text-3xl leading-tight md:text-[2.5rem]">
              Start with one question and a few people.
            </h2>
            <p className="mt-4 text-[17px] leading-relaxed text-ink-soft">
              Start a circle, invite the people you already think with, and ask the
              thing you&rsquo;ve been meaning to ask.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <Action href={START_HREF}>Start a circle</Action>
            <Quiet href={SAMPLE_HREF}>Look around a sample circle</Quiet>
          </div>
        </div>
      </section>

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-10 text-sm text-ink-faint sm:px-6">
        <Wordmark />
        <p>Tools for becoming community.</p>
      </footer>
    </div>
  );
}
