import { useMemo, useState } from 'react';
import { money, today } from '../../lib/format';
import { href } from '../../lib/router';
import { FoodTabs } from './FoodTabs';
import { formatQty } from './stock';
import { REASON_LABELS, groupByStore, shoppingList, type ShoppingItem } from './shopping';
import { stockEntries } from './stockEntries';
import type { FoodProduct, FoodReceipt, StockEvent } from './types';

const KEY = 'life.food.shopping.ticked';

/** Ticked items are remembered for the day only: the list is derived, so tomorrow it is worked out again. */
function loadTicked(day: string): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { day?: string; ids?: string[] } | null;
    return raw?.day === day && Array.isArray(raw.ids) ? new Set(raw.ids) : new Set();
  } catch {
    return new Set();
  }
}
function saveTicked(day: string, ids: Set<string>) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ day, ids: [...ids] }));
  } catch {
    /* private mode: the ticks just last until the page closes */
  }
}

/** The usual amount: "2×" for pieces or packs, "0.5 kg" for weighed goods. */
const amount = (i: ShoppingItem): string => (i.unit === 'pc' ? `${formatQty(i.quantity)}×` : `${formatQty(i.quantity)} ${i.unit}`);

/** What to buy: out and low products, and what you usually rebuy by now, grouped by the cheapest store you know. */
export function ShoppingPage({ receipts, products, events }: { receipts: FoodReceipt[]; products: FoodProduct[]; events: StockEvent[] }) {
  const day = today();
  const [ticked, setTicked] = useState(() => loadTicked(day));
  const items = useMemo(() => shoppingList(stockEntries(receipts, products, events, day), day), [receipts, products, events, day]);
  const groups = useMemo(() => groupByStore(items), [items]);

  const toggle = (id: string) =>
    setTicked((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      saveTicked(day, next);
      return next;
    });

  if (items.length === 0) {
    return (
      <>
        <FoodTabs active="shopping" />
        <div className="empty">
          <p className="muted">Nothing to buy right now. Products that run out or low, or that you usually rebuy by now, show up here with the cheapest store you know of.</p>
        </div>
      </>
    );
  }
  const left = items.filter((i) => !ticked.has(i.productId)).length;
  return (
    <>
      <FoodTabs active="shopping" />
      <p className="muted small">
        {left} of {items.length} left to buy
      </p>
      {groups.map((g) => (
        <section key={g.store ?? 'anywhere'} className="food-gap">
          <h2 className="small muted food-h2">
            {g.store ?? 'No price known yet'}
            {g.estimate > 0 && <span> · about {money(g.estimate)}</span>}
          </h2>
          <ul className="shop-list">
            {g.items.map((i) => (
              <li key={i.productId} className={ticked.has(i.productId) ? 'shop-done' : undefined}>
                <button type="button" className="shop-check" role="checkbox" aria-checked={ticked.has(i.productId)} aria-label={`${i.name}: ${ticked.has(i.productId) ? 'bought' : 'to buy'}`} onClick={() => toggle(i.productId)} />
                <a className="shop-main" href={href(`/food/product/${i.productId}`)}>
                  <strong>{i.name}</strong>
                  <span className="muted small">
                    {[
                      REASON_LABELS[i.reason],
                      amount(i),
                      i.price ? `${money(i.price.regular)}${i.per}` : '',
                      i.saving ? `${money(i.saving)} cheaper than where you bought it last` : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="muted small">The list is worked out from your receipts and stock, so it updates by itself after you shop. Ticks are only for today.</p>
    </>
  );
}
