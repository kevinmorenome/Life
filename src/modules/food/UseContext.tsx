import { useMemo, useState } from 'react';
import { today } from '../../lib/format';
import { batchOrigin } from './BatchList';
import { dateWarning, sortOldestFirst } from './batches';
import { DayPicker } from './DayPicker';
import { unitLabel, type ProductSummary } from './products';
import { formatAmount, type Batch, type Stock } from './stock';
import { withDate } from './stockActions';
import type { StockEvent } from './types';

/**
 * The two choices that go with every "I used / froze / threw out" button: which batch it comes from (the oldest purchase
 * unless you pick another) and which day it happened: tapping a button opens a calendar (`withDay`), and what it logs is
 * dated on the day you tap, so a forgotten use can be logged on its real day.
 */
export function useUseContext(product: ProductSummary, stock: Stock, events: StockEvent[]) {
  const day = today();
  const [batchId, setBatchId] = useState<string | undefined>();
  const [pending, setPending] = useState<((date: string) => void) | null>(null);
  const batches = useMemo(() => sortOldestFirst(product, stock.batches.filter((b) => b.quantity > 1e-9)), [product, stock.batches]);
  const batch = batches.find((b) => b.id !== undefined && b.id === batchId) ?? batches[0];
  /** Opens the calendar; `run` is called with the day that is tapped (nothing happens if it is dismissed). */
  const askDay = (run: (date: string) => void) => setPending(() => run);
  /** An onClick for an action button: tap it, pick the day, and `run` logs it. */
  const withDay = (run: (date: string) => void) => () => askDay(run);
  /** The event(s) dated on `date` (today's stay as they are). */
  const stamp = <T extends StockEvent | StockEvent[] | undefined>(e: T, date: string): T => (date === day ? e : withDate(e, date));
  const picker = pending ? (
    <DayPicker
      today={day}
      title="Which day was it?"
      isDisabled={(d) => dateWarning(d, events, product, batch) !== undefined}
      onPick={(d) => {
        const run = pending;
        setPending(null);
        run(d);
      }}
      onClose={() => setPending(null)}
    />
  ) : null;
  return { day, batches, batch, setBatchId, askDay, withDay, stamp, picker };
}

export type UseContext = ReturnType<typeof useUseContext>;

const label = (product: ProductSummary, b: Batch) => `${batchOrigin(product, b).split(' · ')[0]} · ${formatAmount(b.quantity, product.unit)}${unitLabel(product, b.quantity)}${b.frozen ? ' · frozen' : b.thawed ? ' · thawed' : ''}`;

/** "From" (only when there is a choice of batch), and the calendar that the action buttons open. */
export function UseContextBar({ ctx, product }: { ctx: UseContext; product: ProductSummary }) {
  const { batches, batch } = ctx;
  return (
    <>
      {batches.length > 1 && batch && (
        <div className="use-context">
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
        </div>
      )}
      {ctx.picker}
    </>
  );
}
