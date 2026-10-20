import { redirect } from "next/navigation";
import { db } from "@/db";
import { listMyGatherings } from "@/domain/gatherings";
import { requireUser } from "@/lib/session";

// Where the app opens from a home-screen bookmark (manifest.ts start_url):
// straight into your gathering when there's one, your list when there are
// several, and sign-in first when you're signed out.
export default async function StartPage() {
  const me = await requireUser("/start");
  const mine = await listMyGatherings(db, me.id);
  redirect(mine.length === 1 ? `/g/${mine[0].slug}` : "/home");
}
