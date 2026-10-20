import Link from "next/link";
import { CIRCLE_MAX, CIRCLE_MIN } from "@/domain/circles";
import { join } from "@/app/(app)/g/[gathering]/actions";
import type { CircleColor } from "@/lib/circleColors";
import { Form } from "./Form";
import { CircleGlyph } from "./Glyph";

type CircleRow = {
  id: string; slug: string; name: string; description: string;
  status: string; color?: CircleColor; members: number; isMember: boolean; formingExpiresAt: Date | null;
};

function daysLeft(until: Date | null): string {
  if (!until) return "";
  const d = Math.ceil((until.getTime() - Date.now()) / 86_400_000);
  return d <= 1 ? "last day" : `${d} days left`;
}

export function CircleCard({ circle, gathering }: { circle: CircleRow; gathering: string }) {
  const forming = circle.status === "forming";
  const need = Math.max(0, CIRCLE_MIN - circle.members);
  return (
    <li className="card space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <Link href={`/g/${gathering}/circles/${circle.slug}`} className="flex items-center gap-3 text-lg font-medium hover:underline">
          <CircleGlyph size={24} forming={forming} color={circle.color} />
          {circle.name}
        </Link>
        <span className="label shrink-0">
          {forming ? `forming · ${daysLeft(circle.formingExpiresAt)}` : circle.status}
        </span>
      </div>
      {circle.description && <p className="text-[var(--ink-soft)]">{circle.description}</p>}
      <div className="flex items-center justify-between gap-3">
        <span className="mono text-sm text-[var(--ink-soft)]">
          {circle.members} of {CIRCLE_MAX}
          {forming && need > 0 && ` · needs ${need} more to begin`}
        </span>
        {circle.isMember ? (
          <span className="label shrink-0 whitespace-nowrap">you&apos;re in</span>
        ) : circle.members >= CIRCLE_MAX ? (
          <span className="label shrink-0">full</span>
        ) : !forming ? (
          <Link href={`/g/${gathering}/circles/${circle.slug}`} className="link shrink-0 text-sm">Ask to join</Link>
        ) : (
          <Form action={join} submit="I'm in" pending="Joining…" quiet className="flex items-center gap-3">
            <input type="hidden" name="gathering" value={gathering} />
            <input type="hidden" name="circle" value={circle.id} />
          </Form>
        )}
      </div>
    </li>
  );
}
