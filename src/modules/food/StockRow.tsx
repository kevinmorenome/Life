import { CheckIcon, HalfIcon, MinusIcon, TrashIcon, UsedIcon } from '../../icons';
import { shortDate } from '../../lib/format';
import { href } from '../../lib/router';
import { IconMenu } from '../clothes/IconMenu';
import { pluralize, type ProductSummary } from './products';
import { formatAmount, levelOptions, type Stock } from './stock';
import { partLeftEvent, stockEvent } from './stockActions';
import type { StockEvent } from './types';

/** The word after a quantity: " kg", " l", " cans" for products counted in items, nothing for plain pieces. */
export function unitLabel(p: Pick<ProductSummary, 'unit' | 'packLabel' | 'packSize'>, quantity: number): string {
  if (p.unit !== 'pc') return ` ${p.unit}`;
  return p.packSize && p.packLabel ? ` ${pluralize(p.packLabel, quantity)}` : '';
}

const STATUS_TEXT = { ok: '', 'use-soon': 'use soon', check: 'probably past its date', low: 'running low', out: 'none left' } as const;

/** One product in stock: what is left, and one-tap ways to say some was used, all of it is gone, or it was thrown away. */
export function StockRow({ product, stock, uses = 0, onEvent }: { product: ProductSummary; stock: Stock; /** Uses since it was bought, shown for products that are only "have it". */ uses?: number; onEvent(e: StockEvent): Promise<void> }) {
  const meta = [STATUS_TEXT[stock.status], stock.useBy && stock.status !== 'out' ? `use by ${shortDate(stock.useBy)}` : ''].filter(Boolean).join(' · ');
  return (
    <li className="stock-row">
      <a className="stock-main" href={href(`/food/product/${product.id}`)}>
        <strong>{product.name}</strong>
        <span className="muted small">
          {stock.tracked ? `${formatAmount(stock.quantity, product.unit)}${unitLabel(product, stock.quantity)}` : `have it${uses > 0 ? ` · used ${uses}×` : ''}`}
          {meta && ` · ${meta}`}
        </span>
      </a>
      {stock.tracked ? (
        <IconMenu
          label={`Used some ${product.name}`}
          icon={<HalfIcon />}
          triggerClassName="icon-btn"
          entries={[
            ...(product.unit === 'pc' ? [{ label: product.packSize && product.packLabel ? `Used one ${product.packLabel}` : 'Used one', icon: <MinusIcon />, onSelect: () => onEvent(stockEvent(product.id, 'use', 1, 'app')) }] : []),
            ...levelOptions(stock.quantity, product.unit, product.packSize).map((l) => ({
              label: l.label,
              icon: <HalfIcon />,
              onSelect: () => {
                const e = partLeftEvent(product.id, product.unit, stock, l.fraction, 'app');
                if (e) onEvent(e);
              },
            })),
          ]}
        />
      ) : (
        <button type="button" className="icon-btn" aria-label={`Used ${product.name}, still have it`} onClick={() => onEvent(stockEvent(product.id, 'use', 1, 'app'))}>
          <UsedIcon />
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
