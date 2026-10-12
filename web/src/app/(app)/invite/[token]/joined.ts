/** Where someone lands once in: the circle that holds their seat, else the community. */
export function joinedPath(r: { communitySlug: string; circleSlug: string | null; joinedCircle: boolean }): string {
  return r.joinedCircle && r.circleSlug ? `/c/${r.communitySlug}/circles/${r.circleSlug}` : `/c/${r.communitySlug}`;
}
