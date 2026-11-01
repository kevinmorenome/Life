import { useState } from 'react';
import { money, shortDate, today } from '../../lib/format';
import { href } from '../../lib/router';
import { averageUnitPrice, defaultStorage, perUnit, type ProductSummary } from './products';
import { formatQty, stockOf } from './stock';
import { stockEvent } from './stockActions';
import { unitLabel } from './StockRow';
import { PRODUCT_TYPES, PRODUCT_TYPE_LABELS, STORAGES, type FoodProduct, type ProductType, type StockEvent, type Storage } from './types';

const STORAGE_LABELS = { fridge: 'Fridge', pantry: 'Pantry', freezer: 'Freezer' } as const;

/** One product: how it is tracked, and every time you bought it. */
const EVENT_TEXT = { use: 'Used', toss: 'Threw out', count: 'Counted' } as const;

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
  const ask = (question: string, fallback: string): number | undefined => {
    const n = Number((window.prompt(question, fallback) ?? '').trim().replace(',', '.'));
    return Number.isFinite(n) && n >= 0 && n < 10_000 ? n : undefined;
  };
  const [days, setDays] = useState(product.shelfLifeDays ? String(product.shelfLifeDays) : '');

  // Spread the record first so fields this screen doesn't show survive; create it on the first change.
  const save = (patch: Partial<FoodProduct>) => {
    const now = new Date().toISOString();
    return onSave({ ...record, id: product.id, name: record?.name ?? product.name, type: product.type, storage: product.storage, shelfLifeDays: product.shelfLifeDays, createdAt: record?.createdAt ?? now, ...patch, updatedAt: now });
  };
  const setType = (type: ProductType) => save({ type, ...(product.custom ? {} : { storage: defaultStorage(type) }) });
  const commitDays = () => {
    const n = Number(days.replace(',', '.'));
    const shelfLifeDays = days.trim() && Number.isFinite(n) && n >= 1 ? Math.round(n) : undefined;
    if (shelfLifeDays !== product.shelfLifeDays) save({ shelfLifeDays });
  };

  return (
    <>
      <h1 className="page-title">{product.name}</h1>
      <p className="muted small">
        Bought {product.purchases.length}× · average {money(averageUnitPrice(product))}
        {perUnit(product.unit)}
      </p>

      <section className="food-gap">
        <p className="food-total">
          {formatQty(stock.quantity)}
          <span className="muted small">{unitLabel(product.unit) || ' in stock'}</span>
        </p>
        <p className="muted small">{[stock.status === 'ok' ? '' : stock.status.replace('-', ' '), stock.useBy ? `use by ${shortDate(stock.useBy)}` : ''].filter(Boolean).join(' · ')}</p>
        <div className="chips food-gap">
          <button
            type="button"
            className="chip"
            onClick={() => {
              const n = ask(`How much ${product.name} did you use?`, '1');
              if (n) onEvent(stockEvent(product.id, 'use', n, 'app'));
            }}
          >
            Used some
          </button>
          <button type="button" className="chip" onClick={() => onEvent(stockEvent(product.id, 'count', 0, 'app'))}>
            Finished
          </button>
          <button type="button" className="chip" disabled={stock.quantity <= 0} onClick={() => onEvent(stockEvent(product.id, 'toss', stock.quantity, 'app'))}>
            Threw out
          </button>
          <button
            type="button"
            className="chip"
            onClick={() => {
              const n = ask(`How many ${product.name} do you have now?`, formatQty(stock.quantity));
              if (n !== undefined) onEvent(stockEvent(product.id, 'count', n, 'app'));
            }}
          >
            I have…
          </button>
        </div>
      </section>

      <div className="form">
      <div className="field">
        <span>Type</span>
        <div className="chips">
          {PRODUCT_TYPES.map((t) => (
            <button key={t} type="button" className="chip" aria-pressed={product.type === t} onClick={() => setType(t)}>
              {PRODUCT_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span>Kept in</span>
        <div className="chips">
          {STORAGES.map((s: Storage) => (
            <button key={s} type="button" className="chip" aria-pressed={product.storage === s} onClick={() => save({ storage: s })}>
              {STORAGE_LABELS[s]}
            </button>
          ))}
        </div>
      </div>
      <label className="field">
        <span>Keeps for (days, optional)</span>
        <input inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} onBlur={commitDays} placeholder="e.g. 3" />
      </label>
      </div>

      {events.length > 0 && (
        <>
          <h2 className="small muted food-h2">Activity</h2>
          <ul className="game-list">
            {[...events]
              .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
              .slice(0, 8)
              .map((e) => (
                <li key={e.id} className="game-line">
                  {EVENT_TEXT[e.type]} {e.type === 'count' && e.quantity === 0 ? '→ finished' : `${formatQty(e.quantity)}${unitLabel(product.unit)}`}
                  <span className="muted small">{[shortDate(e.date), e.source === 'claude' ? 'via Claude' : e.source === 'check' ? 'weekly check' : ''].filter(Boolean).join(' · ')}</span>
                </li>
              ))}
          </ul>
        </>
      )}

      <h2 className="small muted food-h2">Purchases</h2>
      <ul className="game-list">
        {product.purchases.map((x, i) => (
          <li key={i}>
            <a className="game-row" href={href(`/food/receipt/${x.receiptId}`)}>
              <strong>
                {x.quantity}
                {x.unit === 'pc' ? ' ×' : ` ${x.unit} ×`} {money(x.unitPrice)} = {money(x.paid)}
              </strong>
              <span className="muted small">{[shortDate(x.date), x.store].join(' · ')}</span>
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}
