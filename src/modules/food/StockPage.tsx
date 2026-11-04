import { useCallback, useEffect, useState } from 'react';
import { today } from '../../lib/format';
import { href } from '../../lib/router';
import { FoodTabs } from './FoodTabs';
import { needsPicture } from './pictures';
import { productRecord } from './productEdits';
import { batchesToCheck } from './stock';
import { stockEntries, storageOf } from './stockEntries';
import { StockSheet, type SheetAct } from './StockSheet';
import { StockTile } from './StockTile';
import { tileInfo } from './stockTiles';
import { STORAGES, type FoodProduct, type FoodReceipt, type StockEvent } from './types';

const STORAGE_LABELS = { fridge: 'Fridge', pantry: 'Pantry', freezer: 'Freezer' } as const;

interface Toast {
  text: string;
  undo?: StockEvent | StockEvent[];
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
}: {
  receipts: FoodReceipt[];
  products: FoodProduct[];
  events: StockEvent[];
  onEvent(e: StockEvent): Promise<void>;
  onProduct(p: FoodProduct): Promise<void>;
}) {
  const day = today();
  const entries = stockEntries(receipts, products, events, day);
  const [selId, setSelId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [showAll, setShowAll] = useState(false);
  const close = useCallback(() => setSelId(null), []);

  // The toast fades on its own; an undo that is not taken stays a plain count history.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 7000);
    return () => clearTimeout(t);
  }, [toast]);

  const have = entries.filter((e) => e.stock.quantity > 0);
  const out = entries.filter((e) => e.stock.quantity === 0);
  const missing = needsPicture(entries).length;
  const toCheck = have.reduce((n, e) => n + batchesToCheck(e.product.type, e.stock, day).length, 0);
  const selected = selId ? entries.find((e) => e.product.id === selId) : undefined;
  const thawed = have.filter((e) => e.stock.thawedQuantity > 0);
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
      {thawed.length > 0 && (
        <div className="food-banner" role="status">
          <strong>Use first: thawed</strong>
          <span className="muted small">{thawed.map((e) => e.product.name).join(', ')}. Thawed food isn’t put back in the freezer.</span>
        </div>
      )}
      {toCheck > 0 && (
        <a className="food-banner" href={href('/food/check')}>
          <strong>Weekly check</strong>
          <span className="muted small">
            {toCheck} {toCheck === 1 ? 'batch' : 'batches'} to confirm
          </span>
        </a>
      )}
      {missing > 0 && (
        <a className="food-banner" href={href('/food/pictures')}>
          <strong>Add pictures</strong>
          <span className="muted small">
            {missing} {missing === 1 ? 'product has' : 'products have'} no picture yet
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
        const inStock = have.filter((e) => storageOf(e) === storage).sort(bySoonest);
        const gone = showAll ? out.filter((e) => storageOf(e) === storage).sort((a, b) => a.product.name.localeCompare(b.product.name)) : [];
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
          onPhoto={(photo) => onProduct(productRecord(selected.product, products.find((p) => p.id === selected.product.id), { photo: photo ?? undefined, hasPhoto: !!photo }, new Date().toISOString()))}
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
                for (const e of [toast.undo].flat()) if (e) await onEvent(e);
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
