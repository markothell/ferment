import { redirect } from "next/navigation";
import { db } from "@/db";
import { Refusal } from "@/domain/errors";
import { acceptInvite } from "@/domain/invites";
import { currentSession } from "@/lib/auth";
import { joinedPath } from "../joined";

export const runtime = "nodejs";

// Where an invitation's sign-in link comes back to (./actions.ts#comeIn):
// accept it and go straight to the circle. Needs the session that link just
// made, so a stray visit only bounces back to the invitation page, which
// explains whatever is wrong.
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const session = await currentSession();
  if (!session) redirect(`/invite/${token}`);
  let to: string;
  try {
    to = joinedPath(await acceptInvite(db, { token, userId: session.user.id, userEmail: session.user.email }));
  } catch (e) {
    if (!(e instanceof Refusal)) throw e;
    to = `/invite/${token}`;
  }
  redirect(to);
}
