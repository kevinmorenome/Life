import { useEffect, useRef, useState } from 'react';
import { CheckIcon, HalfIcon, MinusIcon, TrashIcon } from '../../icons';
import { shortDate, today } from '../../lib/format';
import { href } from '../../lib/router';
import { BatchList } from './BatchList';
import { PictureControl } from './PictureControl';
import { unitLabel } from './products';
import { dayText, tileInfo } from './stockTiles';
import { THAW_DAYS, formatAmount, levelOptions } from './stock';
import { batchEvent, keepOutOfStats, moveEvent, partLeftEvent, stockEvent, usedEarlierEvent } from './stockActions';
import { UseContextBar, useUseContext } from './UseContext';
import { StatsSwitch } from './StatsSwitch';
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
export function StockSheet({ entry, events, onAct: sendAct, onPhoto, onClose }: { entry: Entry; /** This product's stock events (to warn when a newer count covers the day you pick). */ events: StockEvent[]; onAct(a: SheetAct): void; onPhoto(photo: string | null): Promise<void> | void; onClose(): void }) {
  const { product: p, stock: s } = entry;
  const [levels, setLevels] = useState(false);
  // While this is on, what you log still changes the stock but is kept out of the statistics.
  const [quiet, setQuiet] = useState(false);
  // The batch (oldest purchase unless you pick another) and the day (today unless you change it) every action below uses.
  const ctx = useUseContext(p, s, events);
  const onAct = (a: SheetAct, date: string = today()) => {
    const marked = quiet ? { ...a, event: keepOutOfStats(a.event), undo: keepOutOfStats(a.undo) } : a;
    sendAct({ ...marked, event: ctx.stamp(marked.event, date) });
  };
  const box = useRef<HTMLDivElement>(null);
  const day = today();
  const info = tileInfo(entry, day);
  const b = ctx.batch;
  const bid = b?.id;
  const left = b?.quantity ?? s.quantity;
  const options = levelOptions(left, p.unit, p.packSize);

  useEffect(() => {
    box.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  // A count that puts back what there was before: events are never deleted, so "undo" is a newer count.
  const restore = () => (bid && b ? batchEvent(p.id, bid, 'count', b.quantity, 'app') : stockEvent(p.id, 'count', s.quantity, 'app'));
  const ofBatch = (type: 'use' | 'toss' | 'count', quantity: number) => (bid ? batchEvent(p.id, bid, type, quantity, 'app') : stockEvent(p.id, type, quantity, 'app'));
  const one = p.packSize && p.packLabel ? `Used one ${p.packLabel}` : 'Used one';

  function usedOne(date: string) {
    let n = 1;
    if (p.unit !== 'pc') {
      const typed = Number((window.prompt(`How much ${p.name} did you use (${p.unit})?`, '0.1') ?? '').trim().replace(',', '.'));
      if (!Number.isFinite(typed) || typed <= 0) return;
      n = Math.min(typed, left);
    }
    onAct({ event: ofBatch('use', Math.min(n, left)), text: `${p.name}: used ${formatAmount(n, p.unit)}${unitLabel(p, n)}`, undo: restore(), done: s.quantity - n <= 1e-9 }, date);
  }

  /** Puts the chosen batch (all of it, or the amount you type) in the freezer, or takes it out. */
  function move(freezing: boolean, date: string) {
    if (!b || !bid) return;
    let n = b.quantity;
    if (p.unit !== 'pc' || b.quantity > 1) {
      const typed = Number((window.prompt(freezing ? `How much ${p.name} are you putting in the freezer?` : `How much ${p.name} are you taking out of the freezer?`, String(b.quantity)) ?? '').trim().replace(',', '.'));
      if (!Number.isFinite(typed) || typed <= 0) return;
      n = Math.min(typed, b.quantity);
    }
    const event = moveEvent(p.id, bid, freezing ? 'freeze' : 'thaw', n, 'app');
    const amountText = `${formatAmount(n, p.unit)}${unitLabel(p, n)}`;
    onAct({
      event,
      text: freezing ? `${p.name}: ${amountText} in the freezer` : `${p.name}: ${amountText} taken out, use within ${THAW_DAYS} days`,
      undo: [batchEvent(p.id, bid, 'count', b.quantity, 'app'), batchEvent(p.id, `${event.type}-${event.id}:${bid}`, 'count', 0, 'app')],
    }, date);
  }

  const amount = s.quantity <= 0 ? 'Used up' : `${formatAmount(s.quantity, p.unit)}${unitLabel(p, s.quantity)}`;
  const where = `${p.storage[0].toUpperCase()}${p.storage.slice(1)} · bought ${shortDate(p.purchases[0].date)}`;

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
        {s.quantity > 0 && <UseContextBar ctx={ctx} product={p} />}
        <div className="food-actions">
          <button type="button" className="food-action" onClick={ctx.withDay(usedOne)} disabled={s.quantity <= 0}>
            <MinusIcon />
            {p.unit === 'pc' ? one : 'Used some'}
          </button>
          <button type="button" className="food-action" onClick={() => setLevels((v) => !v)} aria-expanded={levels} disabled={options.length === 0}>
            <HalfIcon />
            Part left
          </button>
          <button type="button" className="food-action" disabled={s.quantity <= 0} onClick={ctx.withDay((d) => onAct({ event: ofBatch('count', 0), text: `${p.name} finished`, undo: restore(), done: s.quantity - left <= 1e-9 }, d))}>
            <CheckIcon />
            Finished
          </button>
          <button type="button" className="food-action food-action-wide" disabled={s.quantity <= 0} onClick={() => onAct({ event: usedEarlierEvent(p.id, bid, 'app'), text: `${p.name}: used earlier, no date`, undo: restore(), done: s.quantity - left <= 1e-9 })}>
            <CheckIcon />
            Used earlier, date unknown
          </button>
          <button type="button" className="food-action" disabled={!b || !bid || !!b.frozen || !!b.thawed} onClick={ctx.withDay((d) => move(true, d))}>
            <MinusIcon />
            Put in freezer
          </button>
          <button type="button" className="food-action" disabled={!b || !bid || !b.frozen} onClick={ctx.withDay((d) => move(false, d))}>
            <MinusIcon />
            Take out of freezer
          </button>
          <button type="button" className="food-action food-action-danger" disabled={s.quantity <= 0} onClick={ctx.withDay((d) => onAct({ event: ofBatch('toss', left), text: `${p.name} thrown out`, undo: restore(), done: s.quantity - left <= 1e-9 }, d))}>
            <TrashIcon />
            Threw out
          </button>
        </div>
        <StatsSwitch off={quiet} onChange={setQuiet} />
        {levels && options.length > 0 && (
          <div className="chips food-levels">
            {options.map((l) => (
              <button
                key={l.fraction}
                type="button"
                className="chip"
                onClick={() => {
                  setLevels(false);
                  ctx.askDay((d) => {
                    const e = partLeftEvent(p.id, p.unit, { quantity: left }, l.fraction, 'app');
                    if (e) onAct({ event: bid ? { ...e, batch: bid } : e, text: `${p.name}: ${l.label.toLowerCase()}`, undo: restore() }, d);
                  });
                }}
              >
                {l.label}
              </button>
            ))}
          </div>
        )}
        {s.batches.length > 0 && (
          <>
            <h3 className="small muted food-h2">Batches</h3>
            <BatchList product={p} stock={s} onAct={(a) => (a.event.type === 'expiry' ? onAct({ event: a.event, text: a.text, undo: a.undo }) : ctx.askDay((d) => onAct({ event: a.event, text: a.text, undo: a.undo }, d)))} />
          </>
        )}
        <p className="muted small food-hint">
          {s.quantity <= 0
            ? 'Used up. If you have some again, say how many with I have… on the product page.'
            : p.packSize
              ? `Counted in single ${p.packLabel ? p.packLabel + 's' : 'items'}; ${p.purchases.length === 1 ? 'one purchase' : `${p.purchases.length} purchases`} of packs of ${p.packSize}.`
              : 'Part left lowers the pack you have open.'}{' '}
          <a href={href(`/food/product/${p.id}`)}>Details</a>
        </p>
      </div>
    </>
  );
}
