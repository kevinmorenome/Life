import { useMemo, useState } from 'react';
import { CalendarIcon } from '../../icons';
import { shortDate, today } from '../../lib/format';
import { batchOrigin } from './BatchList';
import { dateWarning, sortOldestFirst } from './batches';
import { unitLabel, type ProductSummary } from './products';
import { formatAmount, type Batch, type Stock } from './stock';
import { withDate } from './stockActions';
import type { StockEvent } from './types';

/**
 * The two choices that go with every "I used / froze / threw out" button: which batch it comes from (the oldest purchase
 * unless you pick another) and which day it happened (today unless you change it). The buttons use `batch` and send what
 * they log through `stamp`, so a forgotten use can be logged on its real day.
 */
export function useUseContext(product: ProductSummary, stock: Stock, events: StockEvent[]) {
  const day = today();
  const [when, setWhen] = useState(day);
  const [batchId, setBatchId] = useState<string | undefined>();
  const batches = useMemo(() => sortOldestFirst(product, stock.batches.filter((b) => b.quantity > 1e-9)), [product, stock.batches]);
  const batch = batches.find((b) => b.id !== undefined && b.id === batchId) ?? batches[0];
  const warning = dateWarning(when, events, product, batch);
  /** The event(s) dated on the chosen day (today's stay as they are). */
  const stamp = <T extends StockEvent | StockEvent[] | undefined>(e: T): T => (when === day ? e : withDate(e, when));
  return { day, when, setWhen, batches, batch, setBatchId, warning, stamp };
}

export type UseContext = ReturnType<typeof useUseContext>;

const label = (product: ProductSummary, b: Batch) => `${batchOrigin(product, b).split(' · ')[0]} · ${formatAmount(b.quantity, product.unit)}${unitLabel(product, b.quantity)}${b.frozen ? ' · frozen' : b.thawed ? ' · thawed' : ''}`;

/** "From" (only when there is a choice) and "Day" controls, with a warning when the day would make the log do nothing. */
export function UseContextBar({ ctx, product }: { ctx: UseContext; product: ProductSummary }) {
  const { batches, batch, when, day } = ctx;
  return (
    <div className="use-context">
      {batches.length > 1 && batch && (
        <label className="use-context-row">
          <span className="muted small">From</span>
          <select className="field-pill" value={batch.id ?? ''} onChange={(e) => ctx.setBatchId(e.target.value)} aria-label="Which batch it comes from">
            {batches.map((b, i) => (
              <option key={b.id ?? `${b.date}-${i}`} value={b.id ?? ''}>
                {label(product, b)}
                {i === 0 ? ' (oldest)' : ''}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="use-context-row">
        <span className="muted small">Day</span>
        {/* A button that opens the browser's own calendar: the date input sits invisibly over it, so tapping it opens the picker. */}
        <span className="use-day field-pill">
          <CalendarIcon />
          <span>{when === day ? 'Today' : shortDate(when)}</span>
          <input type="date" className="use-day-input" max={day} value={when} onChange={(e) => e.target.value && ctx.setWhen(e.target.value > day ? day : e.target.value)} aria-label="Which day it happened: open the calendar" />
        </span>
        {when !== day && (
          <button type="button" className="chip" onClick={() => ctx.setWhen(day)}>
            Today
          </button>
        )}
      </label>
      {ctx.warning && (
        <p className="use-context-warn small" role="status">
          {ctx.warning}
        </p>
      )}
    </div>
  );
}
