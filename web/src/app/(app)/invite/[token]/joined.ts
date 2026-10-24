/** Where someone lands once in: the circle that holds their seat, else the gathering. */
export function joinedPath(r: { gatheringSlug: string; circleSlug: string | null; joinedCircle: boolean }): string {
  return r.joinedCircle && r.circleSlug ? `/g/${r.circleSlug}` : `/g/${r.gatheringSlug}`;
}
