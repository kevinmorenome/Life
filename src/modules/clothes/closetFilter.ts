import { lastWorn, wearCount } from './stats';
import type { Category, ClothingItem, Status } from './types';

export type Sort = 'recent' | 'name' | 'most-worn' | 'least-recent';

export interface ClosetFilters {
  query: string;
  category: Category | 'all';
  subcategory: string;
  status: Status | 'all';
  sort: Sort;
  favoritesOnly: boolean;
}

export const DEFAULT_FILTERS: ClosetFilters = {
  query: '',
  category: 'all',
  subcategory: '',
  status: 'active',
  sort: 'recent',
  favoritesOnly: false,
};

export const SORTS: { value: Sort; label: string }[] = [
  { value: 'recent', label: 'Recently added' },
  { value: 'name', label: 'Name' },
  { value: 'most-worn', label: 'Most worn' },
  { value: 'least-recent', label: 'Longest unworn' },
];

/** Everything except category and sub-category, so the sheet can offer only the ones that exist. */
function baseMatches(items: ClothingItem[], f: ClosetFilters): ClothingItem[] {
  const q = f.query.trim().toLowerCase();
  return items.filter(
    (i) =>
      (f.status === 'all' || i.status === f.status) &&
      (!f.favoritesOnly || i.favorite) &&
      (!q || [i.name, i.brand, i.color, i.subcategory, i.notes, ...(i.tags ?? [])].some((v) => v?.toLowerCase().includes(q))),
  );
}

/** Categories that have items under the other filters, with counts. */
export function categoryCounts(items: ClothingItem[], f: ClosetFilters): Map<Category, number> {
  const counts = new Map<Category, number>();
  for (const i of baseMatches(items, f)) counts.set(i.category, (counts.get(i.category) ?? 0) + 1);
  return counts;
}

/** Sub-categories in use within the chosen category (empty for "all"), A–Z with counts. */
export function subcategoryCounts(items: ClothingItem[], f: ClosetFilters): Map<string, number> {
  const counts = new Map<string, number>();
  if (f.category === 'all') return counts;
  for (const i of baseMatches(items, f)) {
    if (i.category === f.category && i.subcategory) counts.set(i.subcategory, (counts.get(i.subcategory) ?? 0) + 1);
  }
  return new Map([...counts].sort(([a], [b]) => a.localeCompare(b)));
}

export function filterItems(items: ClothingItem[], f: ClosetFilters): ClothingItem[] {
  return baseMatches(items, f)
    .filter((i) => (f.category === 'all' || i.category === f.category) && (!f.subcategory || i.subcategory === f.subcategory))
    .sort((a, b) => {
      switch (f.sort) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'most-worn':
          return wearCount(b) - wearCount(a);
        case 'least-recent':
          return (lastWorn(a) ?? '').localeCompare(lastWorn(b) ?? '');
        default:
          return b.createdAt.localeCompare(a.createdAt);
      }
    });
}

/** How many sheet filters differ from the defaults (search text and the category tabs don't count). */
export function activeFilterCount(f: ClosetFilters): number {
  return [
    f.subcategory !== DEFAULT_FILTERS.subcategory,
    f.status !== DEFAULT_FILTERS.status,
    f.sort !== DEFAULT_FILTERS.sort,
    f.favoritesOnly !== DEFAULT_FILTERS.favoritesOnly,
  ].filter(Boolean).length;
}
