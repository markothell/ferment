import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { circleBySlug } from "@/domain/circles";
import { loadCommunity } from "@/lib/community";
import { ColorPicker } from "@/components/app/ColorPicker";
import { Form } from "@/components/app/Form";
import { Top } from "@/components/app/Top";
import { circleColor } from "./actions";

export const metadata: Metadata = { title: "Circle settings · ferment" };

/** For the circle's host. Just its colour, for now. */
export default async function CircleSettingsPage({ params }: PageProps<"/c/[community]/circles/[circle]/settings">) {
  const p = await params;
  const { me, community } = await loadCommunity(p.community);
  const circle = await circleBySlug(db, community.id, p.circle);
  if (!circle || circle.hostId !== me.id) notFound();
  const base = `/c/${community.slug}`;
  return (
    <>
      <Top trail={[{ label: community.name, href: base }, { label: circle.name, href: `${base}/circles/${circle.slug}` }, { label: "Settings" }]} />
      <main className="mx-auto max-w-2xl space-y-10 px-4 py-8">
        <h1 className="display text-4xl">{circle.name}</h1>
        <section className="space-y-3">
          <h2 className="display text-2xl">Its colour</h2>
          <p className="text-[var(--ink-soft)]">Tints the circle&apos;s page and its core on the community map.</p>
          <Form action={circleColor} submit="Save" quiet className="space-y-4">
            <input type="hidden" name="community" value={community.slug} />
            <input type="hidden" name="circle" value={circle.id} />
            <ColorPicker value={circle.color} />
          </Form>
        </section>
      </main>
    </>
  );
}
