import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/db";
import { joinLinkOf } from "@/domain/joinLinks";
import { loadGroup } from "@/lib/group";
import { appUrl } from "@/lib/urls";
import { ColorPicker } from "@/components/app/ColorPicker";
import { ConfirmForm } from "@/components/app/ConfirmForm";
import { CopyLine } from "@/components/app/CopyLine";
import { Field } from "@/components/app/Field";
import { Form } from "@/components/app/Form";
import { Top } from "@/components/app/Top";
import { archive, circleColor, emailPref, growIntoGathering, joinLinkMake, joinLinkOpen } from "../actions";

export const metadata: Metadata = { title: "Settings · ferment" };

export default async function SettingsPage({ params }: PageProps<"/g/[group]/settings">) {
  const { me, group, gathering, isHost, membership } = await loadGroup((await params).group);
  const base = `/g/${gathering.slug}`;
  const circle = group.kind === "circle" ? group : null;
  const lone = Boolean(circle) && circle!.id === gathering.id;
  const circleHost = circle !== null && circle.hostId === me.id;
  const rootHost = isHost && (!circle || lone);
  const link = rootHost ? await joinLinkOf(db, gathering.id) : null;
  return (
    <>
      <Top trail={lone || !circle
        ? [{ label: group.name, href: `/g/${group.slug}` }, { label: "Settings" }]
        : [{ label: gathering.name, href: base }, { label: circle.name, href: `/g/${circle.slug}` }, { label: "Settings" }]} />
      <main className="mx-auto max-w-2xl space-y-10 px-4 py-8">
        <h1 className="display text-4xl">{circle ? `${circle.name}` : "Settings"}</h1>

        {circle && !circleHost && (
          <p className="text-[var(--ink-soft)]">Only the circle&apos;s host changes its settings. Your email and your list are in <Link href={`${base}/settings`} className="link">{gathering.name}&apos;s settings</Link>.</p>
        )}
        {circleHost && (
          <section className="space-y-3">
            <h2 className="display text-2xl">Its colour</h2>
            <p className="text-[var(--ink-soft)]">Tints the circle&apos;s page{lone ? "" : " and its core on the gathering map"}.</p>
            <Form action={circleColor} submit="Save" quiet className="space-y-4">
              <input type="hidden" name="gathering" value={gathering.slug} />
              <input type="hidden" name="circle" value={circle!.id} />
              <ColorPicker value={circle!.color} />
            </Form>
          </section>
        )}
        {circleHost && lone && (
          <>
            <section className="space-y-3 border-t border-[var(--rule)] pt-8">
              <h2 className="display text-2xl">Grow into a gathering</h2>
              <p className="text-[var(--ink-soft)]">
                A gathering holds several circles and the people not yet in one, with questions to everyone at its centre.
                {gathering.name} becomes its first circle, keeps its address and everything in it, and everyone here is in the gathering too. You host it.
              </p>
              <Form action={growIntoGathering} submit="Host a gathering around it" pending="Making room…" quiet>
                <input type="hidden" name="gathering" value={gathering.slug} />
                <Field label="The gathering's name" name="name" required maxLength={60} defaultValue={gathering.name} hint="Who's gathering, or what about." />
                <Field label="Welcome note" name="note" multiline maxLength={2000} placeholder="Optional. What the gathering is and why it's here." />
              </Form>
            </section>
          </>
        )}

        {circle && !lone && (
          <p className="text-sm text-[var(--ink-soft)]">Email and your list are set for the whole gathering, in <Link href={`${base}/settings`} className="link">{gathering.name}&apos;s settings</Link>.</p>
        )}
        {(!circle || lone) && <>
        <section id="email" className="scroll-mt-4 space-y-3">
          <h2 className="display text-2xl">Email from {gathering.name}</h2>
          <Form action={emailPref} submit="Save" quiet className="space-y-3">
            <input type="hidden" name="gathering" value={gathering.slug} />
            {([
              ["each", "As things happen", "A round opens, answers are revealed, someone answers your question."],
              ["digest", "Once a day", "One email with everything from the day before."],
              ["off", "Never", "Check your inbox here instead."],
            ] as const).map(([value, label, hint]) => (
              <label key={value} className="flex gap-3">
                <input type="radio" name="pref" value={value} defaultChecked={membership.email === value} className="mt-1" />
                <span>
                  <span className="block font-medium">{label}</span>
                  <span className="block text-sm text-[var(--ink-soft)]">{hint}</span>
                </span>
              </label>
            ))}
          </Form>
        </section>

        {rootHost && (
          <section id="link" className="scroll-mt-4 space-y-3 border-t border-[var(--rule)] pt-8">
            <h2 className="display text-2xl">Anyone with the link</h2>
            <p className="text-[var(--ink-soft)]">
              One link that lets whoever has it come straight in, no invitation needed. Off until you make it.
              Room still counts: {lone ? "twelve seats" : `${gathering.maxMembers} people`}. Pause it any time, or make a new one and the old stops working.
            </p>
            {link ? (
              <div className="space-y-3">
                <CopyLine value={appUrl(`/join/${link.token}`)} label="The link" />
                <p className="mono text-sm text-[var(--ink-soft)]">
                  {link.open ? "open" : "paused"} · {link.arrivals === 0 ? "nobody has come in by it yet" : `${link.arrivals} came in by it`}
                </p>
                <div className="flex flex-wrap gap-3">
                  <Form action={joinLinkOpen} submit={link.open ? "Pause it" : "Open it again"} quiet className="space-y-2">
                    <input type="hidden" name="gathering" value={gathering.slug} />
                    <input type="hidden" name="open" value={link.open ? "no" : "yes"} />
                  </Form>
                  <ConfirmForm action={joinLinkMake} submit="Make a new link" confirm="The link you've shared stops working. Anyone already in stays in." yes="New link" doing="Making…" final={false}>
                    <input type="hidden" name="gathering" value={gathering.slug} />
                  </ConfirmForm>
                </div>
              </div>
            ) : (
              <Form action={joinLinkMake} submit="Make a link" pending="Making…" quiet className="space-y-2">
                <input type="hidden" name="gathering" value={gathering.slug} />
              </Form>
            )}
          </section>
        )}

        {isHost && !lone && (
          <section className="space-y-3 border-t border-[var(--rule)] pt-8">
            <span className="label">for hosts</span>
            <Link href={`${base}/setup`} className="card block">
              <span className="block font-medium">Set up {gathering.name} →</span>
              <span className="block text-sm text-[var(--ink-soft)]">The welcome note and question, first circles, invitations.</span>
            </Link>
            <Link href={`${base}/starter`} className="card block">
              <span className="block font-medium">Save as a starter →</span>
              <span className="block text-sm text-[var(--ink-soft)]">Its circles and questions, without anyone in it, so another gathering can start the same way.</span>
            </Link>
          </section>
        )}

        <section className="space-y-3 border-t border-[var(--rule)] pt-8">
          <h2 className="display text-2xl">Your list</h2>
          {membership.archivedAt ? (
            <ConfirmForm action={archive} submit={`Put ${gathering.name} back on my list`} confirm="It returns to your list of gatherings." yes="Put it back" doing="Putting back…" final={false}>
              <input type="hidden" name="gathering" value={gathering.slug} />
              <input type="hidden" name="archived" value="no" />
            </ConfirmForm>
          ) : (
            <ConfirmForm
              action={archive}
              submit={`Archive ${gathering.name} from my list`}
              confirm={`It leaves your own list only. ${gathering.name} and everyone in it carry on as before, you stay a member, and you can put it back from the archived list on your home page.`}
              yes="Archive it" doing="Archiving…" final={false}
            >
              <input type="hidden" name="gathering" value={gathering.slug} />
              <input type="hidden" name="archived" value="yes" />
            </ConfirmForm>
          )}
        </section>
        </>}
      </main>
    </>
  );
}
