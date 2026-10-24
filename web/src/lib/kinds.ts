// What each kind of group may do (GROUPS.md §3). A circle and a gathering are
// two kinds of one thing; the rules that tell them apart live here, not in the
// tables. A new kind is a new entry. A new depth is a kind whose parents
// include a kind that today allows none.

export type GroupKind = "circle" | "gathering";

export type KindRules = {
  /** How many people, at least and at most. A gathering's most is its own setting. */
  people: { min: number; max: number | null };
  /** What it may sit inside; null means it may stand on its own. */
  parents: (GroupKind | null)[];
  /** What it may hold. */
  holds: GroupKind[];
  /** Circles form around a minimum; a gathering is active from the start. */
  forms: boolean;
  /** Questions are nominated and supported into a queue (circle), or asked outright (gathering). */
  queues: boolean;
  /** Seats are the group's to give (circle), or come by invitation confirmed by a host (gathering). */
  seats: boolean;
  /** What it finds can pass to its parent. */
  harvests: boolean;
};

export const KINDS: Record<GroupKind, KindRules> = {
  circle: {
    people: { min: 4, max: 12 },
    parents: ["gathering", null],
    holds: [],
    forms: true,
    queues: true,
    seats: true,
    harvests: true,
  },
  gathering: {
    people: { min: 1, max: null },
    parents: [null],
    holds: ["circle"],
    forms: false,
    queues: false,
    seats: false,
    harvests: false,
  },
};

export function mayHold(parent: GroupKind, child: GroupKind): boolean {
  return KINDS[parent].holds.includes(child);
}

export function mayStandAlone(kind: GroupKind): boolean {
  return KINDS[kind].parents.includes(null);
}
