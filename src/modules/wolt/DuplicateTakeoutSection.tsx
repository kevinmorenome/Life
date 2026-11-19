import { useMemo, useState } from 'react';
import { PREVIEW_LABEL } from '../../lib/preview';
import { useCollection } from '../../lib/useCollection';
import type { TakeoutDetail, WoltOrder } from './types';
import { duplicateOrders } from './wolt';

/**
 * Settings: the same takeout delivery saved twice under different ids is already counted once everywhere; this removes the extra
 * copy for good (the one with item lines stays). Shown only while there are some. Hidden in PR previews, which never write.
 */
export function DuplicateTakeoutSection() {
  const orders = useCollection<WoltOrder>('woltorders');
  const details = useCollection<TakeoutDetail>('takeoutdetails');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const extra = useMemo(() => duplicateOrders(orders.items, new Set(details.items.map((d) => d.orderId))), [orders.items, details.items]);

  if (PREVIEW_LABEL || (extra.length === 0 && !message)) return null;

  async function clean() {
    setBusy(true);
    for (const o of extra) await orders.remove(o.id);
    setMessage(`Removed ${extra.length} duplicate takeout orders.`);
    setBusy(false);
  }

  return (
    <section className="card">
      <h2>Duplicate takeout orders</h2>
      {extra.length > 0 && (
        <>
          <p className="muted small">
            {extra.length} takeout orders are saved twice (same app, day, time, place and amount). They are counted once already; this deletes the extra copy and keeps the one with item lines.
          </p>
          <div className="form-actions start">
            <button className="btn btn-primary" disabled={busy} onClick={clean}>
              Remove {extra.length} duplicates
            </button>
          </div>
        </>
      )}
      {message && <p className="small">{message}</p>}
    </section>
  );
}
