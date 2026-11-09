import { originBatch, type Batch } from './stock';
import type { Entry } from './stockEntries';

/** The day a batch was bought (a frozen or thawed batch follows its name back to the receipt line). */
export function purchaseDateOf(entry: Entry, b: Batch): string {
  return entry.product.purchases.find((x) => x.batch === (b.id ? originBatch(b.id) : undefined))?.date ?? b.date;
}

/** Batches with something left, oldest purchase first; of two from one purchase, the one that is not frozen first. */
export function batchesOldestFirst(entry: Entry): Batch[] {
  return entry.stock.batches
    .filter((b) => b.quantity > 1e-9)
    .sort((a, b) => purchaseDateOf(entry, a).localeCompare(purchaseDateOf(entry, b)) || Number(!!a.frozen) - Number(!!b.frozen));
}
