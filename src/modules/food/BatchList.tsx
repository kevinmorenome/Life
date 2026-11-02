import { CheckIcon, MinusIcon, TrashIcon } from '../../icons';
import { money, shortDate, today } from '../../lib/format';
import { IconMenu } from '../clothes/IconMenu';
import { historyNotes, historyText } from './batchHistory';
import { THAW_DAYS, daysBetween, formatAmount, originBatch, type Batch, type HistoryEntry, type Stock } from './stock';
import { batchEvent, expiryEvent, moveEvent } from './stockActions';
import { dayText, freshnessLevel } from './stockTiles';
import { unitLabel, type ProductSummary } from './products';
import type { StockEvent } from './types';

/** What a batch action reports back: the new event, a line for the toast and the event(s) that put things back. */
export interface BatchAct {
  event: StockEvent;
  text: string;
  undo?: StockEvent | StockEvent[];
}

/** Where a batch came from: the purchase it names (also for frozen and thawed parts of it), or "counted" for stock that only came from a count. */
export function batchOrigin(product: ProductSummary, b: Batch): string {
  const purchase = product.purchases.find((p) => p.batch === (b.id ? originBatch(b.id) : undefined));
  if (!purchase) return `counted ${shortDate(b.date)}`;
  return `bought ${shortDate(purchase.date)} · ${purchase.store} · ${money(purchase.unitPrice)}${purchase.unit === 'pc' ? '' : ` / ${purchase.unit}`}`;
}

/**
 * The batches of a product: each purchase on its own, with its own use-by date, and its own actions (used some,
 * put in the freezer, finished, threw out). Taking something off here lowers only that batch; the product-level
 * buttons take from whichever expires first. Frozen food is a batch of its own with a much later use-by.
 */
export function BatchList({ product, stock, onAct, showPast = false }: { product: ProductSummary; stock: Stock; onAct(a: BatchAct): void; /** Also list the batches that are gone, for their history. */ showPast?: boolean }) {
  const day = today();
  const past = showPast ? stock.pastBatches : [];
  if (!stock.tracked || (stock.batches.length === 0 && past.length === 0)) return null;
  const amount = (q: number) => `${formatAmount(q, product.unit)}${unitLabel(product, q)}`;

  /** What happened to a batch, oldest first: bought, used, put in the freezer… with dates. */
  const history = (entries: HistoryEntry[] | undefined) => (
    <ul className="batch-history">
      {(entries ?? []).map((h, i) => (
        <li key={`${h.eventId ?? 'x'}-${i}`}>
          <span className="muted small batch-history-date">{shortDate(h.date)}</span>
          <span className="small">{historyText(h, amount)}</span>
          {historyNotes(h).length > 0 && <span className="muted small"> · {historyNotes(h).join(' · ')}</span>}
        </li>
      ))}
    </ul>
  );

  /** Asks how much, between a little and all of the batch (everything for a single item). */
  function askAmount(question: string, b: Batch, fallback: number): number | undefined {
    if (product.unit === 'pc' && b.quantity <= 1) return b.quantity;
    const typed = Number((window.prompt(question, String(Math.min(b.quantity, fallback))) ?? '').trim().replace(',', '.'));
    return Number.isFinite(typed) && typed > 0 ? Math.min(typed, b.quantity) : undefined;
  }

  function used(b: Batch) {
    const n = askAmount(`How much of this batch of ${product.name} did you use?`, b, product.unit === 'pc' ? 1 : 0.1);
    if (n === undefined) return;
    onAct({ event: batchEvent(product.id, b.id!, 'use', n, 'app'), text: `${product.name}: used ${amount(n)} of one batch`, undo: batchEvent(product.id, b.id!, 'count', b.quantity, 'app') });
  }

  /** Moves some of the batch into (or out of) the freezer. Undo sets the batch back and empties the part that was moved. */
  function move(b: Batch, freezing: boolean) {
    const n = askAmount(freezing ? `How much of this batch of ${product.name} are you putting in the freezer?` : `How much of this frozen batch of ${product.name} are you taking out?`, b, b.quantity);
    if (n === undefined) return;
    const event = moveEvent(product.id, b.id!, freezing ? 'freeze' : 'thaw', n, 'app');
    onAct({
      event,
      text: freezing ? `${product.name}: ${amount(n)} in the freezer` : `${product.name}: ${amount(n)} taken out, use within ${THAW_DAYS} days`,
      undo: [batchEvent(product.id, b.id!, 'count', b.quantity, 'app'), batchEvent(product.id, `${event.type}-${event.id}:${b.id}`, 'count', 0, 'app')],
    });
  }

  return (
    <>
    <ul className="batch-list">
      {stock.batches.map((b) => {
        const left = b.useBy ? daysBetween(day, b.useBy) : undefined;
        const level = left === undefined ? '' : `lvl-${freshnessLevel(left)}`;
        const act = b.id
          ? [
              { label: 'Used some…', icon: <MinusIcon />, onSelect: () => used(b) },
              // Food that was thawed is not frozen again: it is there to be used.
              ...(b.frozen ? [{ label: 'Take out of freezer…', icon: <MinusIcon />, onSelect: () => move(b, false) }] : b.thawed ? [] : [{ label: 'Put in freezer…', icon: <MinusIcon />, onSelect: () => move(b, true) }]),
              { label: 'Finished', icon: <CheckIcon />, onSelect: () => onAct({ event: batchEvent(product.id, b.id!, 'count', 0, 'app'), text: `${product.name}: batch finished`, undo: batchEvent(product.id, b.id!, 'count', b.quantity, 'app') }) },
              { label: 'Threw out', icon: <TrashIcon />, onSelect: () => onAct({ event: batchEvent(product.id, b.id!, 'toss', b.quantity, 'app'), text: `${product.name}: batch thrown out`, undo: batchEvent(product.id, b.id!, 'count', b.quantity, 'app') }) },
            ]
          : [];
        return (
          <li key={b.id ?? `${b.date}-${b.quantity}`} className={`batch${b.frozen ? ' batch-frozen' : ''}`}>
            <div className="batch-main">
              <strong>
                {amount(b.quantity)}
                {b.frozen && <span className="batch-tag"> · Frozen {shortDate(b.frozen)}</span>}
                {b.thawed && <span className="batch-tag batch-tag-thawed"> · Thawed {shortDate(b.thawed)}</span>}
              </strong>
              <span className="muted small">{batchOrigin(product, b)}</span>
              {b.thawed && <span className="small batch-thawed-note">Use this first; thawed food isn’t put back in the freezer.</span>}
              {b.id && (
                <label className="batch-by">
                  <span className="muted small">Use by</span>
                  <input
                    type="date"
                    value={b.useBy ?? ''}
                    aria-label={`Use-by date for the ${b.frozen ? 'frozen ' : ''}batch ${batchOrigin(product, b)}`}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || v === b.useBy) return;
                      onAct({ event: expiryEvent(product.id, b.id!, v, 'app'), text: `${product.name}: use by ${shortDate(v)}`, undo: b.useBy ? expiryEvent(product.id, b.id!, b.useBy, 'app') : undefined });
                    }}
                  />
                  {left !== undefined && <span className={`food-pill-inline ${level}`}>{dayText(left)}</span>}
                </label>
              )}
            </div>
            {act.length > 0 && <IconMenu entries={act} label={`Actions for this batch of ${product.name}`} />}
            {b.id && stock.history[b.id]?.length > 0 && (
              <details className="batch-details">
                <summary className="muted small">History ({stock.history[b.id].length})</summary>
                {history(stock.history[b.id])}
              </details>
            )}
          </li>
        );
      })}
    </ul>
    {past.length > 0 && (
      <details className="batch-past">
        <summary className="muted small">Earlier batches ({past.length})</summary>
        <ul className="batch-list">
          {[...past].sort((a, b) => b.date.localeCompare(a.date)).map((b) => (
            <li key={b.id} className="batch batch-gone">
              <div className="batch-main">
                <strong>{batchOrigin(product, b)}</strong>
                {history(stock.history[b.id!])}
              </div>
            </li>
          ))}
        </ul>
      </details>
    )}
    </>
  );
}
