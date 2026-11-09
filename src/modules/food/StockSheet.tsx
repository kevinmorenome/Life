import { useEffect, useRef } from 'react';
import { ChevronIcon } from '../../icons';
import { href } from '../../lib/router';
import { ProductStock, type StockAct } from './ProductStock';
import type { Entry } from './stockEntries';
import type { StockEvent } from './types';

export type SheetAct = StockAct;

/**
 * One product, in a sheet over the stock grid: the same overview, batch cards and activity as the product page
 * (`ProductStock`), so a batch is managed where you tapped. It stays open while there is something left.
 */
export function StockSheet({ entry, events, onAct, onPhoto, onClose }: { entry: Entry; events: StockEvent[]; onAct(a: SheetAct): void; onPhoto(photo: string | null): Promise<void> | void; onClose(): void }) {
  const { product: p, stock: s, uses } = entry;
  const box = useRef<HTMLDivElement>(null);

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
        <a className="pstock-link" href={href(`/food/product/${p.id}`)}>
          <span>
            Product details
            <span className="muted small">Prices, purchases and how it is tracked</span>
          </span>
          <ChevronIcon />
        </a>
      </div>
    </>
  );
}
