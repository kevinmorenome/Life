import { money, shortDate } from '../../lib/format';
import { href } from '../../lib/router';
import { FoodTabs } from './FoodTabs';
import { productSummaries, perUnit } from './products';
import { PRODUCT_TYPE_LABELS, STORAGES, type FoodProduct, type FoodReceipt } from './types';

const STORAGE_LABELS = { fridge: 'Fridge', pantry: 'Pantry', freezer: 'Freezer' } as const;

/** Everything you've bought, grouped by where it is kept, newest purchase first. */
export function ProductList({ receipts, products }: { receipts: FoodReceipt[]; products: FoodProduct[] }) {
  const list = productSummaries(receipts, products);
  return (
    <>
      <FoodTabs active="products" />
      {list.length === 0 && (
        <div className="empty">
          <p className="muted">No products yet. They appear here from your receipts.</p>
        </div>
      )}
      {STORAGES.map((storage) => {
        const group = list.filter((p) => p.storage === storage);
        if (group.length === 0) return null;
        return (
          <section key={storage}>
            <h2 className="small muted">{STORAGE_LABELS[storage]}</h2>
            <ul className="game-list">
              {group.map((p) => (
                <li key={p.id}>
                  <a className="game-row" href={href(`/food/product/${p.id}`)}>
                    <strong>{p.name}</strong>
                    <span className="muted small">
                      {[
                        PRODUCT_TYPE_LABELS[p.type],
                        `bought ${p.purchases.length}×`,
                        `last ${shortDate(p.purchases[0].date)}`,
                        `${money(p.purchases[0].unitPrice)}${perUnit(p.unit)}`,
                      ].join(' · ')}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}
