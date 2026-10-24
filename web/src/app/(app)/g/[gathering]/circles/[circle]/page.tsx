import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { circleBySlug } from "@/domain/circles";
import { loadGathering } from "@/lib/gathering";
import { CircleView } from "./CircleView";

type Props = PageProps<"/g/[gathering]/circles/[circle]">;

async function load(params: Props["params"]) {
  const p = await params;
  const ctx = await loadGathering(p.gathering);
  const circle = await circleBySlug(db, ctx.gathering.id, p.circle);
  if (!circle) notFound();
  return { ...ctx, circle };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { circle } = await load(params);
  return { title: `${circle.name} · ferment` };
}

export default async function CirclePage({ params }: Props) {
  const { me, gathering, circle } = await load(params);
  return <CircleView me={me} gathering={gathering} circle={circle} />;
}
