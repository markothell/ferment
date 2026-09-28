import Link from "next/link";
import { CIRCLE_MAX, CIRCLE_MIN } from "@/domain/circles";
import { join } from "@/app/(app)/c/[community]/actions";
import { Form } from "./Form";

type CircleRow = {
  id: string; slug: string; name: string; description: string;
  status: string; members: number; isMember: boolean; formingExpiresAt: Date | null;
};

function daysLeft(until: Date | null): string {
  if (!until) return "";
  const d = Math.ceil((until.getTime() - Date.now()) / 86_400_000);
  return d <= 1 ? "last day" : `${d} days left`;
}

export function CircleCard({ circle, community }: { circle: CircleRow; community: string }) {
  const forming = circle.status === "forming";
  const need = Math.max(0, CIRCLE_MIN - circle.members);
  return (
    <li className="card space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <Link href={`/c/${community}/circles/${circle.slug}`} className="text-lg font-medium hover:underline">
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
        ) : circle.members < CIRCLE_MAX ? (
          <Form action={join} submit="I'm in" pending="Joining…" quiet className="flex items-center gap-3">
            <input type="hidden" name="community" value={community} />
            <input type="hidden" name="circle" value={circle.id} />
          </Form>
        ) : (
          <span className="label shrink-0">full</span>
        )}
      </div>
    </li>
  );
}
