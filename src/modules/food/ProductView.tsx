import { useCallback, useState } from 'react';
import { today } from '../../lib/format';
import { productRecord } from './productEdits';
import { ProductInfo } from './ProductInfo';
import { ProductStock, type StockAct } from './ProductStock';
import type { ProductSummary } from './products';
import { stockOf } from './stock';
import { StockToast, type Toast } from './StockToast';
import type { FoodProduct, StockEvent } from './types';

/**
 * One product: an overview added up from its batches, every purchase as a batch of its own, everything that
 * happened (`ProductStock`), then how it is tracked, what it costs where, and the receipts it was on.
 */
export function ProductView({
  product,
  record,
  events,
  onSave,
  onEvent,
}: {
  product: ProductSummary;
  record?: FoodProduct;
  events: StockEvent[];
  onSave(p: FoodProduct): Promise<void>;
  onEvent(e: StockEvent): Promise<void>;
}) {
  const stock = stockOf(product, product.purchases, events, today());
  const [toast, setToast] = useState<Toast | null>(null);
  const clearToast = useCallback(() => setToast(null), []);
  async function act(a: StockAct) {
    try {
      for (const e of [a.event].flat()) await onEvent(e);
    } catch {
      return setToast({ text: 'That couldn’t be saved. Try again.' });
    }
    setToast({ text: a.text, undo: a.undo });
  }
  // Spread the record first so fields this screen doesn't show survive; create it on the first change.
  const save = (patch: Partial<FoodProduct>) => onSave(productRecord(product, record, patch, new Date().toISOString()));

  return (
    <>
      <ProductStock product={product} stock={stock} onAct={act} onPhoto={(photo) => save({ photo: photo ?? undefined, hasPhoto: !!photo })} />
      <ProductInfo product={product} record={record} onSave={onSave} />
      <StockToast
        toast={toast}
        onDone={clearToast}
        onUndo={async (undo) => {
          for (const e of undo) await onEvent(e);
        }}
      />
    </>
  );
}
