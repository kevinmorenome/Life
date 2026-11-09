import { shortDate } from '../../lib/format';
import type { ProductSummary } from './products';
import { originBatch, type Batch } from './stock';
import type { Entry } from './stockEntries';
import type { StockEvent } from './types';

/** The day a batch was bought (a frozen or thawed batch follows its name back to the receipt line). */
export function purchaseDateIn(product: Pick<ProductSummary, 'purchases'>, b: Batch): string {
  return product.purchases.find((x) => x.batch === (b.id ? originBatch(b.id) : undefined))?.date ?? b.date;
}
export const purchaseDateOf = (entry: Entry, b: Batch): string => purchaseDateIn(entry.product, b);

/** Oldest purchase first; of two from one purchase, the one that is not frozen first. */
export function sortOldestFirst(product: Pick<ProductSummary, 'purchases'>, batches: Batch[]): Batch[] {
  return [...batches].sort((a, b) => purchaseDateIn(product, a).localeCompare(purchaseDateIn(product, b)) || Number(!!a.frozen) - Number(!!b.frozen));
}

/** Batches with something left, oldest purchase first. */
export function batchesOldestFirst(entry: Entry): Batch[] {
  return sortOldestFirst(entry.product, entry.stock.batches.filter((b) => b.quantity > 1e-9));
}

/**
 * Something worth knowing before logging on `date`: stock is replayed by date, so a count newer than that day already
 * covers the event (it would change nothing), and a batch cannot be used before it was bought.
 */
export function dateWarning(date: string, events: StockEvent[], product: Pick<ProductSummary, 'purchases'>, batch?: Batch): string | undefined {
  const covering = events.filter((e) => e.type === 'count' && e.date > date && (!e.batch || !batch?.id || e.batch === batch.id)).sort((a, b) => a.date.localeCompare(b.date))[0];
  if (covering) return `You counted this on ${shortDate(covering.date)}, after this day, so that count already covers it and the stock won't change.`;
  if (batch && purchaseDateIn(product, batch) > date) return `This batch was bought on ${shortDate(purchaseDateIn(product, batch))}, after this day, so the stock won't change.`;
  return undefined;
}
