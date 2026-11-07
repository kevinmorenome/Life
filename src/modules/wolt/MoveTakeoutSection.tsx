import { useMemo, useState } from 'react';
import { PREVIEW_LABEL } from '../../lib/preview';
import { useCollection } from '../../lib/useCollection';
import type { FoodReceipt } from '../food/types';
import { isWoltTakeoutReceipt, takeoutFromReceipt } from './fromReceipts';
import type { WoltOrder } from './types';

/**
 * Settings: Wolt restaurant orders that were filed as food receipts move to Takeout. Shown only while
 * there are some, so it disappears once done. Hidden in PR previews, which never write.
 */
export function MoveTakeoutSection() {
  const receipts = useCollection<FoodReceipt>('foodreceipts');
  const orders = useCollection<WoltOrder>('woltorders');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const found = useMemo(() => receipts.items.filter(isWoltTakeoutReceipt), [receipts.items]);

  if (PREVIEW_LABEL || (found.length === 0 && !message)) return null;

  async function move() {
    setBusy(true);
    const known = new Set(orders.items.map((o) => o.id));
    // Save the order first, then take the receipt out of the food log, so nothing is lost half way.
    for (const r of found) {
      const order = takeoutFromReceipt(r);
      if (!known.has(order.id)) await orders.save(order);
      await receipts.remove(r.id);
    }
    setMessage(`Moved ${found.length} Wolt orders to Takeout.`);
    setBusy(false);
  }

  return (
    <section className="card">
      <h2>Takeout</h2>
      {found.length > 0 && (
        <>
          <p className="muted small">
            {found.length} Wolt restaurant orders are in the food log as one-line receipts. Move them to Takeout so they stop counting as groceries.
          </p>
          <div className="form-actions start">
            <button className="btn btn-primary" disabled={busy} onClick={move}>
              Move {found.length} orders to Takeout
            </button>
          </div>
        </>
      )}
      {message && <p className="small">{message}</p>}
    </section>
  );
}
