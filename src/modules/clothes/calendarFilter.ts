/** The kinds of entry the calendar can be narrowed to. Nothing selected means everything is shown. */
export const FILTER_KINDS = [
  { id: 'outfit', label: 'Outfits' },
  { id: 'work', label: 'Work' },
  { id: 'trip', label: 'Trips' },
  { id: 'place', label: 'Places' },
  { id: 'wolt', label: 'Takeout' },
  { id: 'food', label: 'Groceries' },
  { id: 'rides', label: 'Rides' },
  { id: 'watch', label: 'Watching' },
  { id: 'music', label: 'Music' },
  { id: 'games', label: 'Games' },
  { id: 'cook', label: 'Cooking' },
] as const;

const IDS: string[] = FILTER_KINDS.map((k) => k.id);

/**
 * Which filter a module's mark belongs to: office / home / day off / work trip are all "work", the rest is its own tone.
 * (The "Trips" filter is for the Trips module; a work trip is the `trip` work status, which keeps its `mark-trip` look.)
 */
export function kindOfTone(tone: string): string {
  return tone === 'office' || tone === 'home' || tone === 'off' || tone === 'trip' ? 'work' : tone;
}

/** Whether something of `kind` is shown with these filters selected. */
export function isShown(selected: readonly string[], kind: string): boolean {
  return selected.length === 0 || selected.includes(kind);
}

/** Adds the kind to the selection, or removes it when it is already in. */
export function toggleKind(selected: readonly string[], kind: string): string[] {
  return selected.includes(kind) ? selected.filter((k) => k !== kind) : [...selected, kind];
}

export function parseFilter(raw: string | null): string[] {
  try {
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((k): k is string => typeof k === 'string' && IDS.includes(k)) : [];
  } catch {
    return [];
  }
}
