import { shortDate, today } from '../../lib/format';
import { href } from '../../lib/router';
import { formatAmount, needsCheck } from './stock';
import { stockEntries } from './StockPage';
import { unitLabel } from './StockRow';
import { stockEvent } from './stockActions';
import type { FoodProduct, FoodReceipt, StockEvent } from './types';

/** The weekly check: one tap per thing nothing has confirmed for a while. A "still have it" is a count, so it resets any drift. */
export function CheckPage({ receipts, products, events, onEvent }: { receipts: FoodReceipt[]; products: FoodProduct[]; events: StockEvent[]; onEvent(e: StockEvent): Promise<void> }) {
  const day = today();
  const todo = stockEntries(receipts, products, events, day).filter((e) => needsCheck(e.product.type, e.stock, day));
  return (
    <>
      <h1 className="page-title">Weekly check</h1>
      <p className="muted small">Still have these? One tap each; I’ll leave out what you confirm.</p>
      {todo.length === 0 && (
        <div className="empty">
          <p className="muted">All checked. Nothing to confirm right now.</p>
          <a className="btn btn-primary game-new" href={href('/food/stock')}>
            Back to stock
          </a>
        </div>
      )}
      <ul className="game-list">
        {todo.map(({ product, stock }) => (
          <li key={product.id} className="check-row">
            <strong>{product.name}</strong>
            <span className="muted small">
              {formatAmount(stock.quantity, product.unit)}
              {unitLabel(product, stock.quantity)} thought left{stock.lastConfirmed ? ` · last confirmed ${shortDate(stock.lastConfirmed)}` : ''}
              {stock.status === 'check' ? ' · probably past its date' : ''}
            </span>
            <div className="chips">
              <button type="button" className="chip" onClick={() => onEvent(stockEvent(product.id, 'count', stock.quantity, 'check'))}>
                Still have
              </button>
              <button type="button" className="chip" onClick={() => onEvent(stockEvent(product.id, 'count', 0, 'check'))}>
                Finished
              </button>
              <button type="button" className="chip" onClick={() => onEvent(stockEvent(product.id, 'toss', stock.quantity, 'check'))}>
                Threw out
              </button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
