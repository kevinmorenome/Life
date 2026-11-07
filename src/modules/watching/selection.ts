/** Ticks `id` if it isn't ticked, otherwise unticks it. Returns a new set. */
export function toggled(selected: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(selected);
  if (!next.delete(id)) next.add(id);
  return next;
}

/** Whether every id in `ids` is ticked (false for an empty list). */
export function allSelected(selected: ReadonlySet<string>, ids: readonly string[]): boolean {
  return ids.length > 0 && ids.every((id) => selected.has(id));
}

/** Ticks all of `ids` when some aren't ticked yet, otherwise clears them: what a "select all" button does. */
export function toggledAll(selected: ReadonlySet<string>, ids: readonly string[]): Set<string> {
  const next = new Set(selected);
  if (allSelected(selected, ids)) for (const id of ids) next.delete(id);
  else for (const id of ids) next.add(id);
  return next;
}

/** Keeps only the ticked ids that still exist, e.g. after some were removed or a sync pulled a deletion. */
export function pruned(selected: ReadonlySet<string>, existing: readonly string[]): Set<string> {
  const live = new Set(existing);
  return new Set([...selected].filter((id) => live.has(id)));
}
