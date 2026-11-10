import { useCallback, useState } from 'react';
import { today } from '../../lib/format';
import { href } from '../../lib/router';
import { FoodTabs } from './FoodTabs';
import { needsPicture } from './pictures';
import { productRecord } from './productEdits';
import { batchesToCheck } from './stock';
import { stockEntries, storageOf, storagesInUse } from './stockEntries';
import { StockSheet, type SheetAct } from './StockSheet';
import { StockTile } from './StockTile';
import { StockToast, type Toast } from './StockToast';
import { tileInfo } from './stockTiles';
import { STORAGES, STORAGE_LABELS, type FoodProduct, type FoodReceipt, type StockEvent, type Storage } from './types';

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
  const [place, setPlace] = useState<Storage | 'all'>('all');
  const close = useCallback(() => setSelId(null), []);

  const clearToast = useCallback(() => setToast(null), []);

  const have = entries.filter((e) => e.stock.quantity > 0);
  const out = entries.filter((e) => e.stock.quantity === 0);
  const missing = needsPicture(entries).length;
  const toCheck = have.reduce((n, e) => n + batchesToCheck(e.product.type, e.stock, day, e.product.storage).length, 0);
  // The filter only offers places that have something; one that emptied out falls back to everything.
  const places = storagesInUse(entries);
  const activePlace = place !== 'all' && places.includes(place) ? place : 'all';
  const selected = selId ? entries.find((e) => e.product.id === selId) : undefined;
  const thawed = have.filter((e) => e.stock.thawedQuantity > 0);
  const bySoonest = (a: (typeof have)[number], b: (typeof have)[number]) => tileInfo(a, day).sortKey - tileInfo(b, day).sortKey || a.product.name.localeCompare(b.product.name);

  async function act(a: SheetAct) {
    try {
      for (const e of [a.event].flat()) await onEvent(e);
    } catch {
      return setToast({ text: 'That couldn’t be saved. Try again.' });
    }
    setToast({ text: a.text, undo: a.undo });
    if (a.done) setSelId(null);
  }

  return (
    <>
      <FoodTabs active="stock" />
      {places.length > 1 && (
        <div className="seg seg-sub" role="tablist" aria-label="Where it is kept" style={{ ['--tabs' as string]: places.length + 1 }}>
          {(['all', ...places] as const).map((s) => (
            <button key={s} type="button" role="tab" aria-selected={activePlace === s} onClick={() => setPlace(s)}>
              {s === 'all' ? 'All' : STORAGE_LABELS[s]}
            </button>
          ))}
        </div>
      )}
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
      {activePlace !== 'all' && !have.some((e) => storageOf(e) === activePlace) && have.length > 0 && !(showAll && out.some((e) => storageOf(e) === activePlace)) && (
        <p className="muted food-none">Nothing in stock in the {STORAGE_LABELS[activePlace].toLowerCase()} right now.</p>
      )}
      {STORAGES.filter((s) => activePlace === 'all' || s === activePlace).map((storage) => {
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
          record={products.find((p) => p.id === selected.product.id)}
          onSave={onProduct}
          onAct={act}
          onPhoto={(photo) => onProduct(productRecord(selected.product, products.find((p) => p.id === selected.product.id), { photo: photo ?? undefined, hasPhoto: !!photo }, new Date().toISOString()))}
          onClose={close}
        />
      )}
      <StockToast
        toast={toast}
        onDone={clearToast}
        onUndo={async (undo) => {
          for (const e of undo) await onEvent(e);
        }}
      />
    </>
  );
}
