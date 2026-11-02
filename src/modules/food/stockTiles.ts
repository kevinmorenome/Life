import { DEFAULT_FRESH_DAYS, daysBetween, formatAmount } from './stock';
import { unitLabel } from './products';
import type { Entry } from './stockEntries';

export type Level = 'urgent' | 'soon' | 'ok';

/** How worried to be about a fresh item with this many days left (negative = past its date). */
export const freshnessLevel = (days: number): Level => (days <= 1 ? 'urgent' : days <= 3 ? 'soon' : 'ok');

/** "Past date", "Today", "1 day", "3 days": said in words, so colour is never the only signal. */
export const dayText = (days: number): string => (days < 0 ? 'Past date' : days === 0 ? 'Today' : days === 1 ? '1 day' : `${days} days`);

export interface TileInfo {
  /** Short amount on the tile: "12", "0.91 kg", "½", "Have". */
  badge: string;
  /** What a screen reader says: "Staropramen beer 6-pack, 12 cans". */
  label: string;
  /** Fresh items with 3 days or less to go. */
  pill?: { text: string; level: Level };
  /** How much of its shelf life is left, for fresh items. */
  bar?: { pct: number; level: Level };
  /** Smaller sorts first: the days left, then everything without a date. */
  sortKey: number;
}

/** What a tile shows for one product. `shelfLifeDays` is the product's own, else the default for fresh items. */
export function tileInfo(entry: Entry, today: string): TileInfo {
  const { product: p, stock: s } = entry;
  const badge = !s.tracked ? 'Have' : `${formatAmount(s.quantity, p.unit)}${p.unit === 'pc' ? '' : ` ${p.unit}`}`;
  const label = `${p.name}, ${s.tracked ? `${formatAmount(s.quantity, p.unit)}${unitLabel(p, s.quantity)}` : 'have it'}`;
  if (!s.useBy || p.type !== 'fresh') return { badge, label, sortKey: 1000 };
  const days = daysBetween(today, s.useBy);
  const life = p.shelfLifeDays ?? DEFAULT_FRESH_DAYS;
  const level = freshnessLevel(days);
  return {
    badge,
    label,
    ...(days <= 3 ? { pill: { text: dayText(days), level } } : {}),
    bar: { pct: Math.max(6, Math.min(100, Math.round((Math.max(days, 0) / life) * 100))), level },
    sortKey: days,
  };
}
