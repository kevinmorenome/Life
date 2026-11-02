import { today } from '../../lib/format';
import { productSummaries, type ProductSummary } from './products';
import { stockOf, usesSince, type Stock } from './stock';
import type { FoodProduct, FoodReceipt, StockEvent } from './types';

export interface Entry {
  product: ProductSummary;
  stock: Stock;
  /** Uses since it was last bought; only shown for products that are just "have it". */
  uses: number;
}

/** Every product with what is left of it today. */
export function stockEntries(receipts: FoodReceipt[], products: FoodProduct[], events: StockEvent[], day = today()): Entry[] {
  return productSummaries(receipts, products).map((product) => {
    const mine = events.filter((e) => e.productId === product.id);
    const stock = stockOf(product, product.purchases, mine, day);
    return { product, stock, uses: stock.tracked ? 0 : usesSince(mine, product.purchases[0]?.date) };
  });
}
