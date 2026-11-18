import { useState } from 'react';
import { EditIcon, ThumbDownIcon, ThumbUpIcon } from '../../icons';
import { dishKey, feesOf } from './dishes';
import type { TakeoutDetail, WoltOrder } from './types';
import type { useTakeoutData } from './useTakeoutData';
import { placeName } from './wolt';

type Data = ReturnType<typeof useTakeoutData>;

const price = (n: number, currency: string) => (currency === 'EUR' ? `€${n.toFixed(2)}` : `${n.toFixed(2)} ${currency}`);

/** The items of one order: quantity, name as printed (or your group), price, and whether you liked it. */
export function OrderItems({ order, detail, data }: { order: WoltOrder; detail?: TakeoutDetail; data: Data }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!detail) return <p className="muted small">No item lines for this order yet. Ask Claude to add them from the Wolt PDF.</p>;
  const venue = placeName(order.restaurant);
  const split = feesOf(order, detail);
  return (
    <div className="order-items">
      <ul className="item-lines">
        {detail.items.map((i, n) => {
          const key = dishKey(order.restaurant, i.name);
          const fb = data.verdicts.get(key);
          const group = data.dishOf.get(key);
          const shown = group && group !== i.name.replace(/\s+/g, ' ').trim() ? group : i.name;
          return (
            <li key={n}>
              <span className="item-qty">{i.qty}×</span>
              <span className="item-name">
                {shown}
                {shown !== i.name && <span className="muted small"> · printed: {i.name}</span>}
                {fb?.note && <span className="muted small item-note">“{fb.note}”</span>}
              </span>
              <span className="item-price">{price(i.linePrice, order.currency)}</span>
              <span className="item-actions">
                <button type="button" className="icon-btn" aria-label={`Liked ${i.name}`} aria-pressed={fb?.verdict === 'liked'} onClick={() => data.rate(venue, i.name, { verdict: fb?.verdict === 'liked' ? null : 'liked' })}>
                  <ThumbUpIcon />
                </button>
                <button type="button" className="icon-btn" aria-label={`Didn’t like ${i.name}`} aria-pressed={fb?.verdict === 'disliked'} onClick={() => data.rate(venue, i.name, { verdict: fb?.verdict === 'disliked' ? null : 'disliked' })}>
                  <ThumbDownIcon />
                </button>
                <button type="button" className="icon-btn" aria-label={`Note or name for ${i.name}`} onClick={() => setOpen(open === key ? null : key)}>
                  <EditIcon />
                </button>
              </span>
              {open === key && <ItemEditor venue={venue} raw={i.name} group={shown !== i.name ? shown : ''} note={fb?.note ?? ''} data={data} onDone={() => setOpen(null)} />}
            </li>
          );
        })}
      </ul>
      {split && (
        <p className="muted small">
          Items {price(split.items, order.currency)} · fees and other {price(split.fees, order.currency)}
          {detail.paymentMethod ? ` · ${detail.paymentMethod}` : ''}
        </p>
      )}
    </div>
  );
}

function ItemEditor({ venue, raw, group, note, data, onDone }: { venue: string; raw: string; group: string; note: string; data: Data; onDone: () => void }) {
  const [g, setG] = useState(group);
  const [n, setN] = useState(note);
  return (
    <form
      className="item-editor"
      onSubmit={async (e) => {
        e.preventDefault();
        if (n.trim() !== note.trim()) await data.rate(venue, raw, { note: n });
        if (g.trim() !== group.trim()) await data.regroup({ venue, raw }, g);
        onDone();
      }}
    >
      <label>
        <span className="muted small">Your note</span>
        <input type="text" value={n} onChange={(e) => setN(e.target.value)} placeholder="e.g. less sauce next time" maxLength={500} />
      </label>
      <label>
        <span className="muted small">Call it (groups spellings of the same dish; the printed name stays)</span>
        <input type="text" value={g} onChange={(e) => setG(e.target.value)} placeholder={raw} maxLength={120} />
      </label>
      <button type="submit" className="btn">Save</button>
    </form>
  );
}
