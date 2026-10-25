// Converts items from a Whering wardrobe export into ClothingItems.
// Type-only imports keep this file runnable directly by Node (scripts/import-whering.ts).
import type { Category, ClothingItem } from '../types';

export interface WheringItem {
  category: string;
  brand?: string;
  colors?: string[];
  size?: string;
  price?: number;
  currency?: string;
  tags?: string[];
  timesWorn?: number;
  state?: string;
  imageUrls?: string[];
}

// First match wins, so more specific rules come first.
const CATEGORY_RULES: [RegExp, Category][] = [
  [/PYJAMA|NIGHT|ROBE|LOUNGE/, 'sleepwear'],
  [/RUNNING|SPORTSWEAR|LEGGINGS|TRACK/, 'activewear'],
  [/UNDERWEAR|TRUNKS|BOXER|BRIEF|SOCKS|BRA\b/, 'underwear'],
  [/SNEAKERS|BOOTS|SHOE|SANDAL|LOAFER|HEELS|TRAINERS/, 'shoes'],
  [/BAG|BEANIE|SCARF|CAP\b|HAT|GLASSES|BELT|GLOVES|WATCH|JEWEL/, 'accessories'],
  [/JACKET|COAT|BLAZER|CAPE|PARKA|GILET/, 'outerwear'],
  [/DRESS|JUMPSUIT/, 'dresses'],
  [/JEANS|SHORTS|TROUSER|PANTS|CARGO|CHINO|CULOTTE|SKIRT|JOGGER/, 'bottoms'],
  [/SHIRT|TOP|JUMPER|SWEATER|NECK|KNIT|POLO|BLOUSE|VEST|HOODIE|CARDIGAN/, 'tops'],
];

export function mapCategory(whering: string): Category {
  const c = whering.toUpperCase();
  return CATEGORY_RULES.find(([re]) => re.test(c))?.[1] ?? 'other';
}

// Whering glues some words together; split them before humanizing.
const SPELLING: [RegExp, string][] = [
  [/TSHIRT/g, 'T-SHIRT'],
  [/(PUFFER|BOMBER|LEATHER)JACKET/g, '$1 JACKET'],
  [/^CABLEKNIT$/g, 'CABLE KNIT JUMPER'],
  [/ROLLNECK/g, 'ROLL NECK'],
  [/^TROUSER-PANTS$/g, 'TROUSERS'],
  [/^OTHER-OTHER$/g, 'ITEM'],
  [/^OTHER-/g, ''],
];

/** "SHORT-SLEEVED-TSHIRT" → "short-sleeved T-shirt" */
export function typeLabel(whering: string): string {
  let s = whering.toUpperCase();
  for (const [re, to] of SPELLING) s = s.replace(re, to);
  // Keep hyphens only inside compounds like "short-sleeved", "straight-leg" and "T-shirt".
  return s
    .replace(/(\bT)?-(?=(SLEEVED|LEG|WAISTED|QUARTER|SHIRT)?)/g, (m, t: string | undefined, next: string | undefined) =>
      next && (next !== 'SHIRT' || t) ? m : (t ?? '') + ' ',
    )
    .toLowerCase()
    .replace(/\bt-shirt\b/g, 'T-shirt');
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "BABY BLUE" → "Baby blue" */
export function colorLabel(c: string): string {
  return capitalize(c.toLowerCase());
}

/** "PULL & BEAR" → "Pull & Bear", but keeps "H&M". */
export function brandLabel(b: string): string {
  return b
    .split(' ')
    .map((w) => (/[A-Z]&[A-Z]/i.test(w) ? w.toUpperCase() : capitalize(w.toLowerCase())))
    .join(' ');
}

/** "MEN'S S" → "Men's S"; drops sizes with no actual size ("MEN'S", "MEN'S OTHER"). */
export function sizeLabel(size: string | undefined): string | undefined {
  if (!size) return undefined;
  const rest = size.replace(/^(MEN'S|WOMEN'S|KIDS'?)\s*/i, '').trim();
  if (!rest || /^OTHER$/i.test(rest)) return undefined;
  const gender = size.slice(0, size.length - rest.length).trim();
  return gender ? `${capitalize(gender.toLowerCase())} ${rest}` : rest;
}

/** Lowercases tags and merges "STRAIGHT SLEEVE" with "STRAIGHT-SLEEVE". */
export function tagLabels(tags: string[] | undefined): string[] | undefined {
  if (!tags?.length) return undefined;
  return [...new Set(tags.map((t) => t.toLowerCase().replace(/-/g, ' ').trim()))].filter(Boolean);
}

function displayColor(colors: string[] | undefined): string | undefined {
  const real = (colors ?? []).filter((c) => c !== 'MULTICOLOR');
  if (!real.length) return colors?.length ? 'Multicolor' : undefined;
  if (real.length > 2) return 'Multicolor';
  return real.map(colorLabel).join(' & ');
}

/** Stable id from the photo's file name, so importing twice doesn't duplicate items. */
export function wheringId(item: WheringItem, index: number): string {
  const url = item.imageUrls?.[0] ?? '';
  const m = decodeURIComponent(url).match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  return `whering-${m ? m[1].toLowerCase() : index}`;
}

/**
 * `photo` is the already-processed data URL (or undefined). `createdAt` should
 * preserve the export's order so "Newest" sorting matches Whering.
 */
export function convertItem(
  item: WheringItem,
  index: number,
  opts: { photo?: string; createdAt: string },
): ClothingItem {
  const color = displayColor(item.colors);
  const name = capitalize([color && color !== 'Multicolor' ? color.toLowerCase() : '', typeLabel(item.category)]
    .filter(Boolean)
    .join(' '));
  const notes = item.state === 'GIFTED' ? 'Gifted' : undefined;
  return {
    id: wheringId(item, index),
    name,
    category: mapCategory(item.category),
    brand: item.brand ? brandLabel(item.brand) : undefined,
    color: item.colors?.length ? item.colors.map(colorLabel).join(', ') : undefined,
    size: sizeLabel(item.size),
    seasons: [],
    price: typeof item.price === 'number' ? Math.round(item.price * 100) / 100 : undefined,
    status: 'active',
    photo: opts.photo,
    notes,
    tags: tagLabels(item.tags),
    wears: [],
    priorWears: item.timesWorn || undefined,
    createdAt: opts.createdAt,
    updatedAt: opts.createdAt,
  };
}

/** The most common currency in the export, if any item has one. */
export function exportCurrency(items: WheringItem[]): string | undefined {
  const counts = new Map<string, number>();
  for (const i of items) if (i.currency) counts.set(i.currency, (counts.get(i.currency) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
}
