// Turns clothes that Claude read out of a purchase email into closet items
// (see the `add_receipt_items` tool). The input is untrusted: the email may try
// to steer the model, so every field is validated and anything off-schema is dropped.
import { PALETTE } from '../src/modules/clothes/colors';
import { CATEGORIES, SEASONS, type Category, type ClothingItem, type Season } from '../src/modules/clothes/types';

const MAX_ITEMS = 20;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** The Worker can't downscale, so larger product images are skipped (D1 caps a row at 2 MB). */
export const MAX_PHOTO_BYTES = 700_000;
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export interface ReceiptLine {
  name: string;
  category: Category;
  subcategory?: string;
  brand?: string;
  colors?: string[];
  size?: string;
  material?: string;
  price?: number;
  purchaseDate: string;
  seasons: Season[];
  notes?: string;
  tags?: string[];
  /** https product image to download. */
  imageUrl?: string;
}

function isRealDate(s: unknown): s is string {
  if (typeof s !== 'string' || !DATE.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

const str = (v: unknown, max = 200): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const t = v.trim().slice(0, max);
  return t || undefined;
};

/** Lines without a name are dropped; an unknown category becomes "other"; a missing order date falls back to `fallbackDate`. */
export function parseReceiptLines(input: unknown, fallbackDate: string): ReceiptLine[] {
  if (!Array.isArray(input)) return [];
  const out: ReceiptLine[] = [];
  for (const raw of input.slice(0, MAX_ITEMS)) {
    if (typeof raw !== 'object' || raw === null) continue;
    const r = raw as Record<string, unknown>;
    const name = str(r.name);
    if (!name) continue;
    const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
    const colors = [...new Set(list(r.colors).filter((c) => PALETTE.includes(c)))].slice(0, 5);
    const tags = list(r.tags).map((t) => t.trim().slice(0, 50)).filter(Boolean).slice(0, 20);
    out.push({
      name,
      category: (CATEGORIES as readonly string[]).includes(r.category as string) ? (r.category as Category) : 'other',
      subcategory: str(r.subcategory, 50),
      brand: str(r.brand),
      colors: colors.length ? colors : undefined,
      size: str(r.size, 50),
      material: str(r.material),
      price: typeof r.price === 'number' && Number.isFinite(r.price) && r.price >= 0 ? Math.round(r.price * 100) / 100 : undefined,
      purchaseDate: isRealDate(r.purchaseDate) ? r.purchaseDate : fallbackDate,
      seasons: [...new Set(list(r.seasons).filter((s): s is Season => (SEASONS as readonly string[]).includes(s)))],
      notes: str(r.notes, 1000),
      tags: tags.length ? tags : undefined,
      imageUrl: typeof r.imageUrl === 'string' && r.imageUrl.startsWith('https://') && r.imageUrl.length <= 2000 ? r.imageUrl : undefined,
    });
  }
  return out;
}

/** A fresh closet item, flagged for the owner to check. */
export function receiptItem(line: ReceiptLine, id: string, photo: string | undefined, now: Date): ClothingItem {
  const stamp = now.toISOString();
  return {
    id,
    name: line.name,
    category: line.category,
    subcategory: line.subcategory,
    brand: line.brand,
    colors: line.colors,
    color: line.colors?.join(', '),
    size: line.size,
    material: line.material,
    seasons: line.seasons,
    price: line.price,
    purchaseDate: line.purchaseDate,
    status: 'active',
    photo,
    notes: line.notes,
    tags: line.tags,
    needsReview: true,
    wears: [],
    createdAt: stamp,
    updatedAt: stamp,
  };
}

/** Downloads a product image as a data URL; undefined when it isn't a small enough jpeg/png/webp or the fetch fails. */
export async function fetchPhoto(url: string, doFetch: typeof fetch = fetch): Promise<string | undefined> {
  try {
    const res = await doFetch(url, { signal: AbortSignal.timeout(8000) });
    const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (!res.ok || !PHOTO_TYPES.includes(type)) return undefined;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_PHOTO_BYTES) return undefined;
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return `data:${type};base64,${btoa(binary)}`;
  } catch {
    return undefined;
  }
}
