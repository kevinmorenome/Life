import { itemColors } from './colors';

interface Colored {
  colors?: string[];
  color?: string;
  updatedAt: string;
}

interface Tagged {
  tags?: string[];
  updatedAt: string;
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Adds `name` unless already present (case-insensitive); blank names are ignored. */
export function addChip(list: string[], name: string): string[] {
  const v = name.trim();
  return !v || list.some((x) => same(x, v)) ? list : [...list, v];
}

export function removeChip(list: string[], name: string): string[] {
  return list.filter((x) => !same(x, name));
}

/** Replaces the colour list, keeping the legacy `color` string in step with it. */
export function withColors<T extends Colored>(item: T, colors: string[]): T & Colored {
  return {
    ...item,
    colors: colors.length ? colors : undefined,
    color: colors.length ? colors.join(', ') : undefined,
    updatedAt: new Date().toISOString(),
  };
}

export function withToggledColor<T extends Colored>(item: T, name: string): T & Colored {
  const cur = itemColors(item);
  return withColors(item, cur.some((x) => same(x, name)) ? removeChip(cur, name) : addChip(cur, name));
}

export function withTags<T extends Tagged>(item: T, tags: string[]): T & Tagged {
  return { ...item, tags: tags.length ? tags : undefined, updatedAt: new Date().toISOString() };
}
