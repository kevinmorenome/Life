// Converts items from a Whering wardrobe export into ClothingItems.
// Type-only imports keep this file runnable directly by Node (scripts/import-whering.ts).
import type { Category, ClothingItem, Outfit, Season } from '../types';

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

/** Per-item extras from Whering's API (the "details" file), joined by image URL. */
export interface WheringDetails {
  itemId: string;
  imageUrl: string;
  archived?: boolean;
  brand?: string | null;
  type: string;
  colors?: string[] | null;
  size?: string[] | null;
  price?: number | null;
  state?: string | null;
  /** User-editable in Whering, so it can be wrong (even in the future). */
  dateAdded?: string | null;
  /** When the record was created in Whering. */
  createdAt?: string | null;
  /** ISO timestamp of the most recent wear only; Whering keeps no full history. */
  lastWorn?: string | null;
  wornCount?: number | null;
  seasons?: string[] | null;
  occasions?: string[] | null;
  fabric?: string[] | null;
  tags?: string[] | null;
}

export interface WheringOutfit {
  outfitId: string;
  name?: string | null;
  lastWorn?: string | null;
  wornCount?: number | null;
  createdAt?: string | null;
  occasions?: string[] | null;
  styles?: string[] | null;
  pieceIds: string[];
}

// First match wins, so more specific rules come first.
const CATEGORY_RULES: [RegExp, Category][] = [
  [/PYJAMA|NIGHT|ROBE|LOUNGE/, 'sleepwear'],
  [/SWIM|BIKINI|BATHING|BOARDSHORT/, 'swimwear'],
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
export function tagLabels(tags: (string[] | null | undefined)[] | string[] | undefined): string[] | undefined {
  const flat = (tags ?? []).flat().filter((t): t is string => typeof t === 'string');
  const out = [...new Set(flat.map((t) => t.toLowerCase().replace(/[-_]/g, ' ').trim()))].filter(Boolean);
  return out.length ? out : undefined;
}

const SEASON_WORDS = new Set(['spring', 'summer', 'autumn', 'fall', 'winter']);

/** Whering seasons → ours ("autumn" → "fall", "all_year_round" → all four). */
export function mapSeasons(seasons: string[] | null | undefined): Season[] {
  const out = new Set<Season>();
  for (const s of seasons ?? []) {
    const v = s.toLowerCase();
    if (v === 'all_year_round') ['spring', 'summer', 'fall', 'winter'].forEach((x) => out.add(x as Season));
    else if (v === 'autumn' || v === 'fall') out.add('fall');
    else if (v === 'spring' || v === 'summer' || v === 'winter') out.add(v);
  }
  return (['spring', 'summer', 'fall', 'winter'] as Season[]).filter((s) => out.has(s));
}

/** Occasions without the season words Whering mixes in. */
export function occasionLabels(occasions: string[] | null | undefined): string[] | undefined {
  return tagLabels((occasions ?? []).filter((o) => !SEASON_WORDS.has(o.toLowerCase())));
}

/** Last-worn timestamp → local date. Whering stores worn days as midday UTC-ish, so the UTC date is the day. */
export function wornDate(iso: string | null | undefined): string | undefined {
  return iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : undefined;
}

/**
 * Splits a total wear count into the one known date (the last wear) and the
 * rest as undated wears. Never invents earlier dates.
 */
export function splitWears(count: number, lastWorn: string | null | undefined): Pick<ClothingItem, 'wears' | 'priorWears'> {
  const date = wornDate(lastWorn);
  if (!date) return { wears: [], priorWears: count || undefined };
  return { wears: [date], priorWears: Math.max(count - 1, 0) || undefined };
}

/** Builds a minimal export-style item for archived pieces that only exist in the details file. */
export function detailsToItem(d: WheringDetails): WheringItem {
  const size = d.size?.[0]
    ?.replace(/^men\b\s*/i, "MEN'S ")
    .replace(/^women\b\s*/i, "WOMEN'S ")
    .replace(/\bEU EU\b/, 'EU');
  return {
    category: d.type.toUpperCase(),
    brand: d.brand ?? undefined,
    colors: d.colors?.map((c) => c.toUpperCase()),
    size,
    price: d.price ?? undefined,
    tags: d.tags ?? undefined,
    timesWorn: d.wornCount ?? 0,
    state: d.state?.toUpperCase(),
    imageUrls: [d.imageUrl],
  };
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
  opts: { photo?: string; createdAt: string; updatedAt?: string; details?: WheringDetails },
): ClothingItem {
  const base = convertBasic(item, index, opts);
  const d = opts.details;
  if (!d) return base;
  return {
    ...base,
    status: d.archived ? 'storage' : base.status,
    price: typeof d.price === 'number' ? Math.round(d.price * 100) / 100 : base.price,
    seasons: mapSeasons(d.seasons),
    material: d.fabric?.length ? d.fabric.map(colorLabel).join(', ') : undefined,
    occasions: occasionLabels(d.occasions),
    tags: tagLabels([item.tags, d.tags]),
    ...splitWears(d.wornCount ?? item.timesWorn ?? 0, d.lastWorn),
    createdAt: addedAt(d, opts.updatedAt ?? new Date().toISOString()) ?? base.createdAt,
  };
}

function addedAt(d: WheringDetails, now: string): string | undefined {
  if (d.dateAdded && d.dateAdded <= now) return d.dateAdded;
  return d.createdAt ?? undefined;
}

/**
 * Converts a Whering outfit. `idFor` maps Whering item ids to Life item ids;
 * pieces that weren't imported are dropped.
 */
export function convertOutfit(
  o: WheringOutfit,
  idFor: (wheringItemId: string) => string | undefined,
  opts: { now: string },
): Outfit {
  return {
    id: `whering-outfit-${o.outfitId}`,
    name: o.name?.trim() || undefined,
    itemIds: o.pieceIds.map(idFor).filter((id): id is string => !!id),
    tags: tagLabels([occasionLabels(o.occasions), o.styles]),
    ...splitWears(o.wornCount ?? 0, o.lastWorn),
    createdAt: o.createdAt ?? opts.now,
    updatedAt: opts.now,
  };
}

function convertBasic(
  item: WheringItem,
  index: number,
  opts: { photo?: string; createdAt: string; updatedAt?: string },
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
    subcategory: mapCategory(item.category) === 'other' ? undefined : capitalize(typeLabel(item.category)),
    brand: item.brand ? brandLabel(item.brand) : undefined,
    colors: item.colors?.length ? item.colors.map(colorLabel) : undefined,
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
    updatedAt: opts.updatedAt ?? opts.createdAt,
  };
}

/** The most common currency in the export, if any item has one. */
export function exportCurrency(items: WheringItem[]): string | undefined {
  const counts = new Map<string, number>();
  for (const i of items) if (i.currency) counts.set(i.currency, (counts.get(i.currency) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
}
