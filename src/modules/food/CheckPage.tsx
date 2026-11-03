import { shortDate, today } from '../../lib/format';
import { href } from '../../lib/router';
import { batchOrigin } from './BatchList';
import { batchesToCheck, daysBetween, formatAmount, type Batch } from './stock';
import { stockEntries } from './stockEntries';
import { dayText } from './stockTiles';
import { unitLabel, type ProductSummary } from './products';
import { batchEvent, stockEvent } from './stockActions';
import type { FoodProduct, FoodReceipt, StockEvent } from './types';

/**
 * The weekly check: one question per batch, not per product. Chicken bought on three days is three rows, each with
 * its own date. "Still have" confirms that batch (and starts it again if it was past its date), Finished and Threw
 * out take just that batch.
 */
export function CheckPage({ receipts, products, events, onEvent }: { receipts: FoodReceipt[]; products: FoodProduct[]; events: StockEvent[]; onEvent(e: StockEvent): Promise<void> }) {
  const day = today();
  const rows = stockEntries(receipts, products, events, day).flatMap(({ product, stock }) => batchesToCheck(product.type, stock, day).map((batch) => ({ product, batch })));

  // A batch is named by its purchase; stock that has no name can only be counted for the whole product.
  const still = (product: ProductSummary, b: Batch) => (b.id ? batchEvent(product.id, b.id, 'count', b.quantity, 'check') : stockEvent(product.id, 'count', b.quantity, 'check'));
  const finished = (product: ProductSummary, b: Batch) => (b.id ? batchEvent(product.id, b.id, 'count', 0, 'check') : stockEvent(product.id, 'count', 0, 'check'));
  const threw = (product: ProductSummary, b: Batch) => (b.id ? batchEvent(product.id, b.id, 'toss', b.quantity, 'check') : stockEvent(product.id, 'toss', b.quantity, 'check'));

  return (
    <>
      <h1 className="page-title">Weekly check</h1>
      <p className="muted small">Still have these? One tap per batch; I’ll leave out what you confirm.</p>
      {rows.length === 0 && (
        <div className="empty">
          <p className="muted">All checked. Nothing to confirm right now.</p>
          <a className="btn btn-primary game-new" href={href('/food/stock')}>
            Back to stock
          </a>
        </div>
      )}
      <ul className="game-list">
        {rows.map(({ product, batch: b }) => {
          const left = b.useBy ? daysBetween(day, b.useBy) : undefined;
          return (
            <li key={`${product.id}:${b.id ?? b.date}`} className="check-row">
              <strong>
                {product.name} · {formatAmount(b.quantity, product.unit)}
                {unitLabel(product, b.quantity)}
                {b.frozen ? ' · frozen' : b.thawed ? ' · thawed' : ''}
              </strong>
              <span className="muted small">
                {[
                  batchOrigin(product, b),
                  b.useBy ? `use by ${shortDate(b.useBy)}${left !== undefined && left < 0 ? ` (${dayText(left).toLowerCase()})` : ''}` : '',
                  b.confirmed ? `last confirmed ${shortDate(b.confirmed)}` : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
              <div className="chips">
                <button type="button" className="chip" onClick={() => onEvent(still(product, b))}>
                  Still have
                </button>
                <button type="button" className="chip" onClick={() => onEvent(finished(product, b))}>
                  Finished
                </button>
                <button type="button" className="chip" onClick={() => onEvent(threw(product, b))}>
                  Threw out
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
