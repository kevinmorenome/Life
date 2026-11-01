import { CheckIcon, MinusIcon, TrashIcon } from '../../icons';
import { shortDate } from '../../lib/format';
import { href } from '../../lib/router';
import type { ProductSummary } from './products';
import { formatQty, type Stock } from './stock';
import { stockEvent } from './stockActions';
import type { StockEvent } from './types';

export const unitLabel = (unit: ProductSummary['unit']) => (unit === 'pc' ? '' : ` ${unit}`);

const STATUS_TEXT = { ok: '', 'use-soon': 'use soon', check: 'probably past its date', low: 'running low', out: 'none left' } as const;

/** One product in stock: what is left, and one-tap ways to say some was used, all of it is gone, or it was thrown away. */
export function StockRow({ product, stock, onEvent }: { product: ProductSummary; stock: Stock; onEvent(e: StockEvent): Promise<void> }) {
  const meta = [STATUS_TEXT[stock.status], stock.useBy && stock.status !== 'out' ? `use by ${shortDate(stock.useBy)}` : ''].filter(Boolean).join(' · ');
  return (
    <li className="stock-row">
      <a className="stock-main" href={href(`/food/product/${product.id}`)}>
        <strong>{product.name}</strong>
        <span className="muted small">
          {formatQty(stock.quantity)}
          {unitLabel(product.unit)}
          {meta && ` · ${meta}`}
        </span>
      </a>
      {product.unit === 'pc' && (
        <button type="button" className="icon-btn" aria-label={`Used one ${product.name}`} onClick={() => onEvent(stockEvent(product.id, 'use', 1, 'app'))}>
          <MinusIcon />
        </button>
      )}
      <button type="button" className="icon-btn" aria-label={`${product.name} is finished`} onClick={() => onEvent(stockEvent(product.id, 'count', 0, 'app'))}>
        <CheckIcon />
      </button>
      <button type="button" className="icon-btn" aria-label={`Threw out ${product.name}`} onClick={() => onEvent(stockEvent(product.id, 'toss', stock.quantity, 'app'))}>
        <TrashIcon />
      </button>
    </li>
  );
}
