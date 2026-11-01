import { href } from '../../lib/router';
import { today } from '../../lib/format';
import { FoodTabs } from './FoodTabs';
import { productSummaries, type ProductSummary } from './products';
import { needsCheck, stockOf, type Stock } from './stock';
import { StockRow } from './StockRow';
import { STORAGES, type FoodProduct, type FoodReceipt, type StockEvent } from './types';

const STORAGE_LABELS = { fridge: 'Fridge', pantry: 'Pantry', freezer: 'Freezer' } as const;

export interface Entry {
  product: ProductSummary;
  stock: Stock;
}

/** Every product with what is left of it today. */
export function stockEntries(receipts: FoodReceipt[], products: FoodProduct[], events: StockEvent[], day = today()): Entry[] {
  return productSummaries(receipts, products).map((product) => ({
    product,
    stock: stockOf(product, product.purchases, events.filter((e) => e.productId === product.id), day),
  }));
}

/** What you have, with the things to use soon first and a way to the weekly check. */
export function StockPage({ receipts, products, events, onEvent }: { receipts: FoodReceipt[]; products: FoodProduct[]; events: StockEvent[]; onEvent(e: StockEvent): Promise<void> }) {
  const day = today();
  const entries = stockEntries(receipts, products, events, day);
  const have = entries.filter((e) => e.stock.quantity > 0);
  const soon = have.filter((e) => e.stock.status === 'use-soon' || e.stock.status === 'check').sort((a, b) => (a.stock.useBy ?? '').localeCompare(b.stock.useBy ?? ''));
  const rest = have.filter((e) => !soon.includes(e));
  const toCheck = have.filter((e) => needsCheck(e.product.type, e.stock, day)).length;
  const out = entries.filter((e) => e.stock.quantity === 0);

  return (
    <>
      <FoodTabs active="stock" />
      {entries.length === 0 && (
        <div className="empty">
          <p className="muted">Nothing here yet. Stock is worked out from your receipts, so add one first.</p>
        </div>
      )}
      {toCheck > 0 && (
        <a className="game-row" href={href('/food/check')}>
          <strong>Weekly check</strong>
          <span className="muted small">
            {toCheck} {toCheck === 1 ? 'thing' : 'things'} to confirm: do you still have them?
          </span>
        </a>
      )}
      {soon.length > 0 && (
        <section>
          <h2 className="small muted">Use soon</h2>
          <ul className="game-list">
            {soon.map((e) => (
              <StockRow key={e.product.id} {...e} onEvent={onEvent} />
            ))}
          </ul>
        </section>
      )}
      {STORAGES.map((storage) => {
        const group = rest.filter((e) => e.product.storage === storage);
        if (group.length === 0) return null;
        return (
          <section key={storage}>
            <h2 className="small muted">{STORAGE_LABELS[storage]}</h2>
            <ul className="game-list">
              {group.map((e) => (
                <StockRow key={e.product.id} {...e} onEvent={onEvent} />
              ))}
            </ul>
          </section>
        );
      })}
      {out.length > 0 && (
        <section>
          <h2 className="small muted">Used up</h2>
          <ul className="game-list">
            {out.map((e) => (
              <li key={e.product.id}>
                <a className="game-row" href={href(`/food/product/${e.product.id}`)}>
                  <strong>{e.product.name}</strong>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
