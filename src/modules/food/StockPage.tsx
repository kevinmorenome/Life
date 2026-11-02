import { useCallback, useEffect, useState } from 'react';
import { today } from '../../lib/format';
import { href } from '../../lib/router';
import { FoodTabs } from './FoodTabs';
import { productRecord } from './productEdits';
import { needsCheck } from './stock';
import { stockEntries } from './stockEntries';
import { StockSheet, type SheetAct } from './StockSheet';
import { StockTile } from './StockTile';
import { tileInfo } from './stockTiles';
import { STORAGES, type FoodProduct, type FoodReceipt, type StockEvent } from './types';

const STORAGE_LABELS = { fridge: 'Fridge', pantry: 'Pantry', freezer: 'Freezer' } as const;

interface Toast {
  text: string;
  undo?: StockEvent;
}

/**
 * Everything you buy, as a grid of pictures: what you have first (the things to use soon at the top of each section),
 * and, when asked, what is used up, greyed out after it.
 */
export function StockPage({
  receipts,
  products,
  events,
  onEvent,
  onProduct,
  initialShowAll = false,
}: {
  receipts: FoodReceipt[];
  products: FoodProduct[];
  events: StockEvent[];
  onEvent(e: StockEvent): Promise<void>;
  onProduct(p: FoodProduct): Promise<void>;
  /** Start with the used-up products shown (the old `#/food/products` address). */
  initialShowAll?: boolean;
}) {
  const day = today();
  const entries = stockEntries(receipts, products, events, day);
  const [selId, setSelId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [showAll, setShowAll] = useState(initialShowAll);
  const close = useCallback(() => setSelId(null), []);

  // The toast fades on its own; an undo that is not taken stays a plain count history.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 7000);
    return () => clearTimeout(t);
  }, [toast]);

  const have = entries.filter((e) => e.stock.quantity > 0);
  const out = entries.filter((e) => e.stock.quantity === 0);
  const toCheck = have.filter((e) => needsCheck(e.product.type, e.stock, day)).length;
  const selected = selId ? entries.find((e) => e.product.id === selId) : undefined;
  const bySoonest = (a: (typeof have)[number], b: (typeof have)[number]) => tileInfo(a, day).sortKey - tileInfo(b, day).sortKey || a.product.name.localeCompare(b.product.name);

  async function act(a: SheetAct) {
    await onEvent(a.event);
    setToast({ text: a.text, undo: a.undo });
    if (a.done) setSelId(null);
  }

  return (
    <>
      <FoodTabs active="stock" />
      {entries.length === 0 && (
        <div className="empty">
          <p className="muted">Nothing here yet. Stock is worked out from your receipts, so add one first.</p>
        </div>
      )}
      {toCheck > 0 && (
        <a className="food-banner" href={href('/food/check')}>
          <strong>Weekly check</strong>
          <span className="muted small">
            {toCheck} {toCheck === 1 ? 'thing' : 'things'} to confirm
          </span>
        </a>
      )}
      {out.length > 0 && (
        <div className="chips food-filter">
          <button type="button" className="chip" aria-pressed={showAll} onClick={() => setShowAll((v) => !v)}>
            Show used up ({out.length})
          </button>
        </div>
      )}
      {entries.length > 0 && have.length === 0 && !showAll && <p className="muted food-none">Nothing in stock right now.</p>}
      {STORAGES.map((storage) => {
        const inStock = have.filter((e) => e.product.storage === storage).sort(bySoonest);
        const gone = showAll ? out.filter((e) => e.product.storage === storage).sort((a, b) => a.product.name.localeCompare(b.product.name)) : [];
        if (inStock.length + gone.length === 0) return null;
        return (
          <section key={storage} className="food-section">
            <div className="food-section-head">
              <h2>{STORAGE_LABELS[storage]}</h2>
              <span className="muted small">
                {inStock.length} {inStock.length === 1 ? 'item' : 'items'}
                {gone.length > 0 ? ` · ${gone.length} used up` : ''}
              </span>
            </div>
            <ul className="food-grid">
              {[...inStock, ...gone].map((e) => (
                <StockTile key={e.product.id} entry={e} today={day} onOpen={setSelId} />
              ))}
            </ul>
          </section>
        );
      })}
      {selected && (
        <StockSheet
          key={selected.product.id}
          entry={selected}
          onAct={act}
          onPhoto={(photo) => onProduct(productRecord(selected.product, products.find((p) => p.id === selected.product.id), { photo: photo ?? undefined }, new Date().toISOString()))}
          onClose={close}
        />
      )}
      {toast && (
        <div className="food-toast" role="status">
          <span>{toast.text}</span>
          {toast.undo && (
            <button
              type="button"
              onClick={async () => {
                if (toast.undo) await onEvent(toast.undo);
                setToast(null);
              }}
            >
              Undo
            </button>
          )}
        </div>
      )}
    </>
  );
}
