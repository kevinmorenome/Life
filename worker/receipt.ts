// Validates receipt items that Claude read out of an email (see `add_receipt_draft`).
import { PALETTE } from '../src/modules/clothes/colors';
import { CATEGORIES } from '../src/modules/clothes/types';
import type { ReceiptDraftItem } from './protocol';

const MAX_ITEMS = 20;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

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

/**
 * Validates items read from an email; they are untrusted (the email may try to steer the model).
 * Anything off-schema is dropped or replaced rather than trusted. `knownImages`
 * are the only image URLs allowed through.
 */
export function parseExtraction(input: unknown, fallbackDate: string, knownImages: string[]): ReceiptDraftItem[] {
  const list = (input as { items?: unknown } | null)?.items;
  if (!Array.isArray(list)) return [];
  const out: ReceiptDraftItem[] = [];
  for (const raw of list.slice(0, MAX_ITEMS)) {
    if (typeof raw !== 'object' || raw === null) continue;
    const r = raw as Record<string, unknown>;
    const name = str(r.name);
    if (!name) continue;
    const colors = Array.isArray(r.colors)
      ? [...new Set(r.colors.filter((c): c is string => typeof c === 'string' && PALETTE.includes(c)))].slice(0, 5)
      : [];
    const price = typeof r.price === 'number' && Number.isFinite(r.price) && r.price >= 0 ? Math.round(r.price * 100) / 100 : undefined;
    out.push({
      name,
      category: (CATEGORIES as readonly string[]).includes(r.category as string) ? (r.category as string) : 'other',
      subcategory: str(r.subcategory, 50),
      brand: str(r.brand),
      colors: colors.length ? colors : undefined,
      size: str(r.size, 50),
      price,
      purchaseDate: isRealDate(r.purchaseDate) ? r.purchaseDate : fallbackDate,
      imageUrl: typeof r.imageUrl === 'string' && knownImages.includes(r.imageUrl) ? r.imageUrl : undefined,
    });
  }
  return out;
}
