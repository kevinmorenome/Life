import { today } from '../../lib/format';
import { productSummaries, type ProductSummary } from './products';
import { stockOf, type Stock } from './stock';
import { STORAGES, type FoodProduct, type FoodReceipt, type StockEvent, type Storage } from './types';

export interface Entry {
  product: ProductSummary;
  stock: Stock;
}

/** Every product with what is left of it today. */
export function stockEntries(receipts: FoodReceipt[], products: FoodProduct[], events: StockEvent[], day = today()): Entry[] {
  return productSummaries(receipts, products).map((product) => {
    const mine = events.filter((e) => e.productId === product.id);
    const stock = stockOf(product, product.purchases, mine, day);
    return { product, stock };
  });
}

/** Where a product shows in the stock grid: the freezer once everything of it is frozen, otherwise where it is normally kept. */
export function storageOf(e: Entry): Storage {
  return e.stock.batches.length > 0 && e.stock.batches.every((b) => b.frozen) ? 'freezer' : e.product.storage;
}

/** The places that have at least one product (in stock or used up), in the order of `STORAGES`: the filter on top of the stock grid. */
export function storagesInUse(entries: Entry[]): Storage[] {
  const used = new Set(entries.map(storageOf));
  return STORAGES.filter((s) => used.has(s));
}
