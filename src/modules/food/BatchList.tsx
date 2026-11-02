import { CheckIcon, MinusIcon, TrashIcon } from '../../icons';
import { money, shortDate, today } from '../../lib/format';
import { IconMenu } from '../clothes/IconMenu';
import { daysBetween, formatAmount, type Batch, type Stock } from './stock';
import { batchEvent, expiryEvent } from './stockActions';
import { dayText, freshnessLevel } from './stockTiles';
import { unitLabel, type ProductSummary } from './products';
import type { StockEvent } from './types';

/** What a batch action reports back: the new event, a line for the toast and the event that puts things back. */
export interface BatchAct {
  event: StockEvent;
  text: string;
  undo?: StockEvent;
}

/** Where a batch came from: the purchase it names, or "counted" for stock that only came from a count. */
function origin(product: ProductSummary, b: Batch): string {
  const purchase = product.purchases.find((p) => p.batch === b.id);
  if (!purchase) return `counted ${shortDate(b.date)}`;
  return `bought ${shortDate(purchase.date)} · ${purchase.store} · ${money(purchase.unitPrice)}${purchase.unit === 'pc' ? '' : ` / ${purchase.unit}`}`;
}

/**
 * The batches of a product: each purchase on its own, with its own use-by date, and its own actions (used some,
 * finished, threw out). Taking something off here lowers only that batch; the product-level buttons take from
 * whichever expires first.
 */
export function BatchList({ product, stock, onAct }: { product: ProductSummary; stock: Stock; onAct(a: BatchAct): void }) {
  const day = today();
  if (!stock.tracked || stock.batches.length === 0) return null;
  const amount = (q: number) => `${formatAmount(q, product.unit)}${unitLabel(product, q)}`;

  function used(b: Batch) {
    let n = 1;
    if (product.unit !== 'pc' || b.quantity > 1) {
      const typed = Number((window.prompt(`How much of this batch of ${product.name} did you use?`, String(Math.min(b.quantity, product.unit === 'pc' ? 1 : 0.1))) ?? '').trim().replace(',', '.'));
      if (!Number.isFinite(typed) || typed <= 0) return;
      n = Math.min(typed, b.quantity);
    }
    onAct({ event: batchEvent(product.id, b.id!, 'use', n, 'app'), text: `${product.name}: used ${amount(n)} of one batch`, undo: batchEvent(product.id, b.id!, 'count', b.quantity, 'app') });
  }

  return (
    <ul className="batch-list">
      {stock.batches.map((b) => {
        const left = b.useBy ? daysBetween(day, b.useBy) : undefined;
        const level = left === undefined ? '' : `lvl-${freshnessLevel(left)}`;
        const act = b.id
          ? [
              { label: 'Used some…', icon: <MinusIcon />, onSelect: () => used(b) },
              { label: 'Finished', icon: <CheckIcon />, onSelect: () => onAct({ event: batchEvent(product.id, b.id!, 'count', 0, 'app'), text: `${product.name}: batch finished`, undo: batchEvent(product.id, b.id!, 'count', b.quantity, 'app') }) },
              { label: 'Threw out', icon: <TrashIcon />, onSelect: () => onAct({ event: batchEvent(product.id, b.id!, 'toss', b.quantity, 'app'), text: `${product.name}: batch thrown out`, undo: batchEvent(product.id, b.id!, 'count', b.quantity, 'app') }) },
            ]
          : [];
        return (
          <li key={b.id ?? `${b.date}-${b.quantity}`} className="batch">
            <div className="batch-main">
              <strong>{amount(b.quantity)}</strong>
              <span className="muted small">{origin(product, b)}</span>
              {b.id && (
                <label className="batch-by">
                  <span className="muted small">Use by</span>
                  <input
                    type="date"
                    value={b.useBy ?? ''}
                    aria-label={`Use-by date for the batch ${origin(product, b)}`}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || v === b.useBy) return;
                      onAct({ event: expiryEvent(product.id, b.id!, v, 'app'), text: `${product.name}: use by ${shortDate(v)}`, undo: b.useBy ? expiryEvent(product.id, b.id!, b.useBy, 'app') : undefined });
                    }}
                  />
                  {left !== undefined && <span className={`food-pill-inline ${level}`}>{dayText(left)}</span>}
                </label>
              )}
            </div>
            {act.length > 0 && <IconMenu entries={act} label={`Actions for this batch of ${product.name}`} />}
          </li>
        );
      })}
    </ul>
  );
}
