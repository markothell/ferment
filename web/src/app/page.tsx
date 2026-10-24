import Link from "next/link";
import { cookies } from "next/headers";
import { PROJECT_NAME } from "@/lib/brand";
import { RisingMark } from "@/components/app/Logo";
import { Story } from "@/components/home/Story";
import { WhereToStart } from "@/components/home/WhereToStart";
import { OpenedAsApp } from "@/components/home/OpenedAsApp";
import { THEME_COOKIE } from "@/lib/theme";
import "./home.css";

// The homepage. It explains the social side, not the screens: six beats beside
// one drawing, then where to start, then a nod to those who came before.
// The two ways in (STARTERS.md §5): start a gathering, or look through the
// starters other gatherings began with.
const START_HREF = "/new";
const GATHERING_HREF = "/new?kind=gathering";
const LIBRARY_HREF = "/library";
const ORIGIN_HREF = "https://holoscopic.io";

// Those whose work this is built on, and what each revealed.
const PIONEERS: { name: string; href?: string; revealed: string }[] = [
  { name: "Microsolidarity", href: "https://www.microsolidarity.cc", revealed: "Revealed that community has a fractal nature." },
  { name: "Imago dialogue", href: "https://imagorelationships.org", revealed: "Revealed that a simple set of rules can generate transformative conversation." },
  { name: "Internal Family Systems", href: "https://ifs-institute.com", revealed: "Revealed that unification needs a seat for every member before they can work together." },
  { name: "Presencing Institute", href: "https://www.presencing.org", revealed: "Revealed that the smallest transformative protocol is listening to each other and being present." },
  { name: "Sharing circles", revealed: "Throughout history, around the world. The wisdom all of these draw from." },
];

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
      <OpenedAsApp />
      <div className="home-wrap">
        <header className="home-top">
          <Wordmark />
          <nav className="home-links">
            <Link href={LIBRARY_HREF} className="hidden sm:inline">Starters</Link>
            <Link href="/signin">Sign in</Link>
            <Link href={START_HREF} className="home-pill">Start a conversation</Link>
          </nav>
        </header>

        <Story startHref={START_HREF} libraryHref={LIBRARY_HREF} />

        <p className="home-band mono">where to start</p>
        <WhereToStart circleHref={START_HREF} gatheringHref={GATHERING_HREF} />

        <p className="home-band mono">inspired by</p>
        <section className="home-roots">
          <div>
            <h2 className="display">A nod to pioneers in human process.</h2>
            <p className="home-roots-lead">What each of them revealed, and what this is built on. Behind all of them, the sharing circle traditions through time.</p>
            <p className="home-roots-more"><a href={ORIGIN_HREF} className="home-quiet">Read how ferment came to be</a></p>
          </div>
          <ul>
            {PIONEERS.map((p) => (
              <li key={p.name}>
                <span className="home-roots-who">{p.href ? <a href={p.href}>{p.name}</a> : p.name}</span>
                <p className="home-roots-what">{p.revealed}</p>
              </li>
            ))}
          </ul>
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
