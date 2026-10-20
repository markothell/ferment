import Link from "next/link";
import { cookies } from "next/headers";
import { PROJECT_NAME } from "@/lib/brand";
import { RisingMark } from "@/components/app/Logo";
import { HowItGrows } from "@/components/home/HowItGrows";
import { THEME_COOKIE } from "@/lib/theme";
import "./home.css";

// The homepage (design/ferment/archive/home.html). It explains the social
// side, not the screens. Two ways in (STARTERS.md §5): start a gathering, or
// look through the starters other gatherings began with.
const START_HREF = "/new";
const LIBRARY_HREF = "/library";

// iOS opens a home-screen bookmark on the page it was saved from, not the
// manifest's start_url, so a bookmark of this page goes on to /start too.
const OPENED_AS_APP = `if (matchMedia("(display-mode: standalone)").matches || navigator.standalone) location.replace("/start");`;

function Wordmark() {
  return (
    <span className="home-wm">
      <RisingMark size={28} />
      {PROJECT_NAME}
    </span>
  );
}

export default async function Home() {
  // Light unless a theme was picked in settings; "match this device" follows the device here too.
  const saved = (await cookies()).get(THEME_COOKIE)?.value;
  const theme = saved === "dark" ? "dark" : saved === "system" ? undefined : "light";
  return (
    <div className="ferment home" data-theme={theme}>
      <script dangerouslySetInnerHTML={{ __html: OPENED_AS_APP }} />
      <div className="home-wrap">
        <header className="home-top">
          <Wordmark />
          <nav className="home-links">
            <Link href={LIBRARY_HREF} className="hidden sm:inline">Starters</Link>
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
            <Link href={LIBRARY_HREF} className="home-quiet">Browse starters</Link>
          </div>
        </section>

        <p className="home-band mono">how it grows</p>
        <HowItGrows />

        <p className="home-band mono">two ways in</p>
        <section className="home-ways">
          <div className="home-way">
            <h2 className="display">Begin from a starter</h2>
            <p>Gatherings that went well, ready to begin again: a welcome, a few circles, and the questions they open with. Read one through, then make it yours.</p>
            <Link href={LIBRARY_HREF} className="home-quiet">Browse starters</Link>
          </div>
          <div className="home-way">
            <h2 className="display">Start a conversation</h2>
            <p>Ask one question you&rsquo;d love to hear people answer, and send it to a few of them. A gathering can grow from there, when you&rsquo;re ready.</p>
            <div><Link href={START_HREF} className="home-btn">Start a conversation</Link></div>
          </div>
        </section>

        <footer className="home-foot">
          <span className="home-address">ferment.earth</span>
          <span>Tools for becoming community.</span>
          <Link href="/contact" className="home-contact">Contact</Link>
        </footer>
      </div>
    </div>
  );
}
