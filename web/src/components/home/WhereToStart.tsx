import Link from "next/link";
import { UNIT, UNIT_CIRCLES, UNIT_LOOSE, UNIT_SEATS } from "@/lib/storyScene";

// The two invitations under the story, each with its small drawing. Today both
// lead to /new: a circle is started inside a gathering, and a gathering with one
// question and a few people is the lightest thing there is. A lighter path for
// "start a circle" is still to be designed.
export function WhereToStart({ circleHref, gatheringHref }: { circleHref: string; gatheringHref: string }) {
  return (
    <section className="home-pair">
      <div className="home-unit">
        <svg viewBox={`0 0 ${UNIT} ${UNIT}`} role="img" aria-label="Eight seats around a circle, with a shared middle.">
          <circle cx={100} cy={100} r={72} fill="none" stroke="var(--rule-strong)" strokeWidth={1.2} />
          {UNIT_SEATS.map(([x, y], k) => (
            <circle key={k} cx={x} cy={y} r={k === 0 ? 7 : 6} fill={k === 0 ? "var(--ink)" : "var(--raised)"} stroke="var(--ink)" strokeWidth={1.5} />
          ))}
          <circle cx={100} cy={100} r={9} fill="var(--shared)" />
        </svg>
        <div>
          <h2 className="display">Start a circle.</h2>
          <p>Four to twelve people you know, around one question at a time. Everyone answers once, in their own voice. Then the circle sees where it landed. What is said in a circle stays in it.</p>
          <span className="mono home-unit-note">4 to 12 people &middot; one question at a time</span>
          <div className="home-ctas"><Link href={circleHref} className="home-quiet">Start a circle</Link></div>
        </div>
      </div>
      <div className="home-unit">
        <svg viewBox={`0 0 ${UNIT} ${UNIT}`} role="img" aria-label="A larger ring holding three small circles and a few people on their own, each circle joined to a shared middle.">
          <circle cx={100} cy={100} r={92} fill="none" stroke="var(--rule-strong)" strokeWidth={1.2} />
          {UNIT_CIRCLES.map((c, j) => (
            <line key={j} x1={c.at[0]} y1={c.at[1]} x2={100} y2={100} stroke="var(--shared)" strokeWidth={1.2} strokeDasharray="2 5" strokeLinecap="round" />
          ))}
          {UNIT_CIRCLES.map((c, j) => (
            <g key={j}>
              <circle cx={c.at[0]} cy={c.at[1]} r={c.r} fill="var(--ground)" stroke="var(--rule-strong)" strokeWidth={1.1} />
              {c.seats.map(([x, y], k) => <circle key={k} cx={x} cy={y} r={3.6} fill="var(--raised)" stroke="var(--ink)" strokeWidth={1.1} />)}
              <circle cx={c.at[0]} cy={c.at[1]} r={4.5} fill="var(--shared)" />
            </g>
          ))}
          {UNIT_LOOSE.map(([x, y], k) => <circle key={k} cx={x} cy={y} r={4} fill="var(--raised)" stroke="var(--ink)" strokeWidth={1.2} />)}
          <circle cx={100} cy={100} r={9} fill="var(--shared)" />
        </svg>
        <div>
          <h2 className="display">Host a gathering.</h2>
          <p>Your circles, and the people not yet in one, thinking something through together. When a circle is ready, it passes what it found to the middle, and the whole gathering thinks with it. You can begin from how another gathering did it: their questions and the way they were asked, never what anyone said.</p>
          <p>A gathering is where a group answers those questions on purpose, together.</p>
          <span className="mono home-unit-note">a few circles &middot; one middle</span>
          <div className="home-ctas"><Link href={gatheringHref} className="home-quiet">Host a gathering</Link></div>
        </div>
      </div>
    </section>
  );
}
