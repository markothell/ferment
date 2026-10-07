import Link from "next/link";
import { cookies } from "next/headers";
import { PROJECT_NAME } from "@/lib/brand";
import { RisingMark } from "@/components/app/Logo";
import { HowItGrows } from "@/components/home/HowItGrows";
import { THEME_COOKIE } from "@/lib/theme";
import "./home.css";

// The homepage (design/ferment/archive/home.html). Its first readers are people
// who were invited, so it explains the social side, not the screens.
// "Start a conversation" goes to the community setup until there's a lighter
// first step. "Open circles" goes to the sample community until outsiders can
// look in on real ones.
const START_HREF = "/new";
const LOOK_HREF = "/demo/community";

function Wordmark() {
  return (
    <span className="home-wm">
      <RisingMark size={28} />
      {PROJECT_NAME}
    </span>
  );
}

export default async function Home() {
  // Follows the theme picked in the app's footer, so the two never disagree.
  const saved = (await cookies()).get(THEME_COOKIE)?.value;
  const theme = saved === "light" || saved === "dark" ? saved : undefined;
  return (
    <div className="ferment home" data-theme={theme}>
      <div className="home-wrap">
        <header className="home-top">
          <Wordmark />
          <nav className="home-links">
            <Link href={LOOK_HREF} className="hidden sm:inline">Open circles</Link>
            <Link href="/signin">Sign in</Link>
          </nav>
        </header>

        <section className="home-hero">
          <p className="home-lead display">
            <span>We shape the world with our ideas.</span>
            <span>We shape our ideas with each other.</span>
          </p>
          <h1 className="display">
            Culture is grown in <em className="hi">conversation</em>.
          </h1>
          <p className="home-after display">This is where you pass it on.</p>
          <div className="home-ctas">
            <Link href={START_HREF} className="home-btn">Start a conversation</Link>
            <Link href={LOOK_HREF} className="home-quiet">Look in on open circles</Link>
          </div>
        </section>

        <p className="home-band mono">how it grows</p>
        <HowItGrows />

        <p className="home-band mono">two ways in</p>
        <section className="home-ways">
          <div className="home-way">
            <h2 className="display">Sit in on a circle</h2>
            <p>Some circles keep a seat open. Read the question, add your answer, and see if it&rsquo;s your kind of table. There&rsquo;s nothing to set up.</p>
            <Link href={LOOK_HREF} className="home-quiet">Look in on open circles</Link>
          </div>
          <div className="home-way">
            <h2 className="display">Start a conversation</h2>
            <p>Ask one question you&rsquo;d love to hear people answer, and send it to a few of them. A community can grow from there, when you&rsquo;re ready.</p>
            <div><Link href={START_HREF} className="home-btn">Start a conversation</Link></div>
          </div>
        </section>

        <footer className="home-foot">
          <span className="home-address">ferment.earth</span>
          <span>Tools for becoming community.</span>
        </footer>
      </div>
    </div>
  );
}
