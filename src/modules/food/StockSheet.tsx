import { useEffect, useRef, useState } from 'react';
import { CheckIcon, HalfIcon, MinusIcon, TrashIcon, UsedIcon } from '../../icons';
import { shortDate, today } from '../../lib/format';
import { href } from '../../lib/router';
import { BatchList } from './BatchList';
import { PictureControl } from './PictureControl';
import { unitLabel } from './products';
import { dayText, tileInfo } from './stockTiles';
import { formatAmount, levelOptions } from './stock';
import { partLeftEvent, stockEvent } from './stockActions';
import type { Entry } from './stockEntries';
import type { StockEvent } from './types';

/** What the sheet reports back: the new event, a line for the toast, and (when it can be taken back) the count that restores the old amount. */
export interface SheetAct {
  event: StockEvent;
  text: string;
  undo?: StockEvent | StockEvent[];
  /** Close the sheet: the product is used up. */
  done?: boolean;
}

/** The actions for one product, in a sheet over the stock grid: a big picture, the amount, and four ways to say what happened. */
export function StockSheet({ entry, onAct, onPhoto, onClose }: { entry: Entry; onAct(a: SheetAct): void; onPhoto(photo: string | null): Promise<void> | void; onClose(): void }) {
  const { product: p, stock: s, uses } = entry;
  const [levels, setLevels] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const day = today();
  const info = tileInfo(entry, day);
  const have = !s.tracked;
  const options = have ? [] : levelOptions(s.quantity, p.unit, p.packSize);

  useEffect(() => {
    box.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  // A count that puts back what there was before: events are never deleted, so "undo" is a newer count.
  const restore = () => stockEvent(p.id, 'count', s.quantity, 'app');
  const one = p.packSize && p.packLabel ? `Used one ${p.packLabel}` : 'Used one';

  function usedOne() {
    if (have) return onAct({ event: stockEvent(p.id, 'use', 1, 'app'), text: `${p.name}: used, still have it` });
    let n = 1;
    if (p.unit !== 'pc') {
      const typed = Number((window.prompt(`How much ${p.name} did you use (${p.unit})?`, '0.1') ?? '').trim().replace(',', '.'));
      if (!Number.isFinite(typed) || typed <= 0) return;
      n = Math.min(typed, s.quantity);
    }
    onAct({ event: stockEvent(p.id, 'use', n, 'app'), text: `${p.name}: used ${formatAmount(n, p.unit)}${unitLabel(p, n)}`, undo: restore(), done: s.quantity - n <= 1e-9 });
  }

  const amount = s.quantity <= 0 ? 'Used up' : have ? 'Have it' : `${formatAmount(s.quantity, p.unit)}${unitLabel(p, s.quantity)}`;
  const where = `${p.storage[0].toUpperCase()}${p.storage.slice(1)} · bought ${shortDate(p.purchases[0].date)}${have && uses > 0 ? ` · used ${uses}×` : ''}`;

  return (
    <>
      <button type="button" className="food-scrim" aria-label="Close" onClick={onClose} />
      <div className="food-sheet" role="dialog" aria-modal="true" aria-label={p.name} tabIndex={-1} ref={box}>
        <div className="food-grip" aria-hidden />
        <div className="food-sheet-head">
          <PictureControl product={p} className="food-art-big" onPhoto={onPhoto} />
          <div className="food-sheet-text">
            <h2>{p.name}</h2>
            <p className="food-sheet-amount">{amount}</p>
            <p className="muted small">{where}</p>
          </div>
        </div>
        {info.bar && s.useBy && (
          <p className="food-fresh">
            {info.pill ? <span className={`food-pill-inline lvl-${info.pill.level}`}>{info.pill.text}</span> : <span className={`food-pill-inline lvl-${info.bar.level}`}>{dayText(Math.max(0, Math.round((new Date(s.useBy).getTime() - new Date(day).getTime()) / 86_400_000)))}</span>}
            <span className="muted small">Use by {shortDate(s.useBy)}</span>
          </p>
        )}
        <div className="food-actions">
          <button type="button" className="food-action" onClick={usedOne} disabled={s.quantity <= 0}>
            {have ? <UsedIcon /> : <MinusIcon />}
            {have ? 'Used it' : p.unit === 'pc' ? one : 'Used some'}
          </button>
          <button type="button" className="food-action" onClick={() => setLevels((v) => !v)} aria-expanded={levels} disabled={options.length === 0}>
            <HalfIcon />
            Part left
          </button>
          <button type="button" className="food-action" disabled={s.quantity <= 0} onClick={() => onAct({ event: stockEvent(p.id, 'count', 0, 'app'), text: `${p.name} finished`, undo: restore(), done: true })}>
            <CheckIcon />
            Finished
          </button>
          <button type="button" className="food-action food-action-danger" disabled={s.quantity <= 0} onClick={() => onAct({ event: stockEvent(p.id, 'toss', s.quantity, 'app'), text: `${p.name} thrown out`, undo: restore(), done: true })}>
            <TrashIcon />
            Threw out
          </button>
        </div>
        {levels && options.length > 0 && (
          <div className="chips food-levels">
            {options.map((l) => (
              <button
                key={l.fraction}
                type="button"
                className="chip"
                onClick={() => {
                  const e = partLeftEvent(p.id, p.unit, s, l.fraction, 'app');
                  if (e) onAct({ event: e, text: `${p.name}: ${l.label.toLowerCase()}`, undo: restore() });
                  setLevels(false);
                }}
              >
                {l.label}
              </button>
            ))}
          </div>
        )}
        {!have && s.batches.length > 0 && (
          <>
            <h3 className="small muted food-h2">Batches</h3>
            <BatchList product={p} stock={s} onAct={(a) => onAct({ event: a.event, text: a.text, undo: a.undo })} />
          </>
        )}
        <p className="muted small food-hint">
          {s.quantity <= 0
            ? 'Used up. If you have some again, say how many with I have… on the product page.'
            : have
            ? 'Counted as have it or out: Used it logs a use and keeps it in stock; Finished takes it away.'
            : p.packSize
              ? `Counted in single ${p.packLabel ? p.packLabel + 's' : 'items'}; ${p.purchases.length === 1 ? 'one purchase' : `${p.purchases.length} purchases`} of packs of ${p.packSize}.`
              : 'Part left lowers the pack you have open.'}{' '}
          <a href={href(`/food/product/${p.id}`)}>Details</a>
        </p>
      </div>
    </>
  );
}
