import { normalizeKey, type ProductSummary, type Purchase } from './products';

export interface ProductHit {
  product: ProductSummary;
  /** The newest purchase: what you paid, where and when. */
  last: Purchase;
  /** The lowest price paid per unit when it is clearly below the last one (a different purchase). */
  cheaper?: Purchase;
}

/** Every word of the search must appear in the product's name or in what the receipts printed for it ("KECAP" for ketchup). */
function matches(product: ProductSummary, words: string[]): number | undefined {
  const name = normalizeKey(product.name);
  const printed = normalizeKey(product.purchases.map((p) => p.rawName ?? '').join(' '));
  let score = 0;
  for (const w of words) {
    if (name.split(' ').some((x) => x.startsWith(w))) score += 2;
    else if (name.includes(w)) score += 1;
    else if (printed.includes(w)) score += 0.5;
    else return undefined;
  }
  return score;
}

/**
 * Products found by the words typed, best match first and then the most recently bought. With nothing typed
 * every product is listed, newest purchase first. Purchases in a different unit than the newest are ignored
 * when looking for a cheaper price, so kg and pieces are never compared.
 */
export function searchProducts(products: ProductSummary[], query: string): ProductHit[] {
  const words = normalizeKey(query).split(' ').filter(Boolean);
  const hits: (ProductHit & { score: number })[] = [];
  for (const product of products) {
    if (product.purchases.length === 0) continue;
    const score = words.length ? matches(product, words) : 0;
    if (score === undefined) continue;
    const last = product.purchases[0];
    const lowest = product.purchases.filter((p) => p.unit === last.unit).reduce((m, p) => (p.unitPrice < m.unitPrice ? p : m), last);
    hits.push({ product, last, cheaper: lowest !== last && lowest.unitPrice < last.unitPrice - 0.004 ? lowest : undefined, score });
  }
  return hits
    .sort((a, b) => b.score - a.score || b.last.date.localeCompare(a.last.date) || a.product.name.localeCompare(b.product.name))
    .map(({ score: _score, ...hit }) => hit);
}
