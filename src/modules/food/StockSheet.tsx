import { useEffect, useRef, useState } from 'react';
import { ChevronIcon } from '../../icons';
import { ProductInfo } from './ProductInfo';
import { ProductStock, type StockAct } from './ProductStock';
import type { Entry } from './stockEntries';
import type { FoodProduct, StockEvent } from './types';

export type SheetAct = StockAct;

/**
 * One product, in a sheet over the stock grid: the same overview, batch cards and activity as the product page
 * (`ProductStock`), so a batch is managed where you tapped. It stays open while there is something left. At the
 * bottom, Product details opens and closes the rest of the product page (`ProductInfo`) in place.
 */
export function StockSheet({
  entry,
  events,
  record,
  onAct,
  onPhoto,
  onSave,
  onClose,
}: {
  entry: Entry;
  events: StockEvent[];
  /** The product's own record, when it has one. */
  record?: FoodProduct;
  onAct(a: SheetAct): void;
  onPhoto(photo: string | null): Promise<void> | void;
  onSave(p: FoodProduct): Promise<void> | void;
  onClose(): void;
}) {
  const { product: p, stock: s, uses } = entry;
  const box = useRef<HTMLDivElement>(null);
  const [details, setDetails] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  // What opens is below the fold of the sheet: bring its heading up so it is seen to open.
  useEffect(() => {
    if (details) toggle.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
  }, [details]);

  useEffect(() => {
    box.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  return (
    <>
      <button type="button" className="food-scrim" aria-label="Close" onClick={onClose} />
      <div className="food-sheet" role="dialog" aria-modal="true" aria-label={p.name} tabIndex={-1} ref={box}>
        <div className="food-grip" aria-hidden />
        <ProductStock product={p} stock={s} events={events} uses={uses} heading="h2" activityLimit={4} onAct={onAct} onPhoto={onPhoto} />
        <button ref={toggle} type="button" className={`pstock-link${details ? ' is-open' : ''}`} aria-expanded={details} onClick={() => setDetails(!details)}>
          <span>
            Product details
            <span className="muted small">Prices, purchases and how it is tracked</span>
          </span>
          <ChevronIcon />
        </button>
        {details && (
          <div className="pstock-details">
            <ProductInfo product={p} record={record} onSave={onSave} />
          </div>
        )}
      </div>
    </>
  );
}
