import { useMemo, useState } from 'react';
import { money, shortDate } from '../../lib/format';
import { href } from '../../lib/router';
import { FoodTabs } from './FoodTabs';
import { searchProducts } from './productSearch';
import { perUnit, productSummaries } from './products';
import type { FoodProduct, FoodReceipt } from './types';

const PAGE = 40;

/** Every product you ever bought, searchable: what it cost last time, where and when. Tap one for its page. */
export function ProductsPage({ receipts, products }: { receipts: FoodReceipt[]; products: FoodProduct[] }) {
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const all = useMemo(() => productSummaries(receipts, products), [receipts, products]);
  const hits = useMemo(() => searchProducts(all, query), [all, query]);

  return (
    <>
      <FoodTabs active="products" />
      <input
        type="search"
        className="search"
        placeholder="Search products, e.g. ketchup"
        aria-label="Search products"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setLimit(PAGE);
        }}
      />
      {all.length === 0 ? (
        <p className="muted">No products yet. They appear from your grocery receipts.</p>
      ) : hits.length === 0 ? (
        <p className="muted">Nothing matches “{query.trim()}”. Try part of the name; the text printed on the receipt is searched too.</p>
      ) : (
        <ul className="game-list">
          {hits.slice(0, limit).map(({ product, last, cheaper }) => (
            <li key={product.id}>
              <a className="game-row" href={href(`/food/product/${product.id}`)}>
                <strong>
                  {product.name} · {money(last.unitPrice)}
                  {perUnit(last.unit)}
                </strong>
                <span className="muted small">
                  {[`${last.store}, ${shortDate(last.date)}`, last.discount && last.discount > 0.004 ? 'on offer' : '', `bought ${product.purchases.length}×`].filter(Boolean).join(' · ')}
                </span>
                {cheaper && (
                  <span className="muted small">
                    Paid less: {money(cheaper.unitPrice)} at {cheaper.store}, {shortDate(cheaper.date)}
                  </span>
                )}
              </a>
            </li>
          ))}
        </ul>
      )}
      {hits.length > limit && (
        <button type="button" className="btn" onClick={() => setLimit((l) => l + PAGE)}>
          Show more ({hits.length - limit})
        </button>
      )}
    </>
  );
}
