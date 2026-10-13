import { redirect } from "next/navigation";
import { db } from "@/db";
import { listMyCommunities } from "@/domain/communities";
import { requireUser } from "@/lib/session";

// Where the app opens from a home-screen bookmark (manifest.ts start_url):
// straight into your community when there's one, your list when there are
// several, and sign-in first when you're signed out.
export default async function StartPage() {
  const me = await requireUser("/start");
  const mine = await listMyCommunities(db, me.id);
  redirect(mine.length === 1 ? `/c/${mine[0].slug}` : "/home");
}
