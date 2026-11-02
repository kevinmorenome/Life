/** Which day-screen widgets the user has collapsed. Pure helpers; the storage is `useWidgetCollapsed`. */

export const COLLAPSED_KEY = 'life.dayWidgets.collapsed';

/** Reads the stored list defensively: anything that isn't a list of strings is treated as "nothing collapsed". */
export function parseCollapsed(raw: string | null | undefined): Set<string> {
  if (!raw) return new Set();
  try {
    const v: unknown = JSON.parse(raw);
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

export function serializeCollapsed(ids: Set<string>): string {
  return JSON.stringify([...ids].sort());
}

/** A new set with `id` collapsed or expanded. */
export function withCollapsed(ids: Set<string>, id: string, collapsed: boolean): Set<string> {
  const next = new Set(ids);
  if (collapsed) next.add(id);
  else next.delete(id);
  return next;
}
