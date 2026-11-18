import { useState } from 'react';
import { EditIcon, ThumbDownIcon, ThumbUpIcon } from '../../icons';
import { dishKey, feesOf, mineOf } from './dishes';
import { groupItems, optionChoice } from './receiptPdf';
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
        {groupItems(detail.items).map((g) => {
          const i = g.item;
          const n = g.index;
          if (g.kind === 'fee') {
            return (
              <li key={n} className="item-fee">
                <span className="item-qty" />
                <span className="item-name muted small">{i.name} <span className="small">· fee</span></span>
                <span className="item-price muted small">{price(i.linePrice, order.currency)}</span>
              </li>
            );
          }
          const choices = g.options.map((x) => optionChoice(x.name)).filter(Boolean);
          const key = dishKey(order.restaurant, i.name);
          const fb = data.verdicts.get(key);
          const mine = mineOf(i.qty, data.shares.get(order.id), n);
          const group = data.dishOf.get(key);
          const shown = group && group !== i.name.replace(/\s+/g, ' ').trim() ? group : i.name;
          return (
            <li key={n}>
              <span className="item-qty">{mine === i.qty ? `${i.qty}×` : `${mine}/${i.qty}×`}</span>
              <span className="item-name">
                {shown}
                {shown !== i.name && <span className="muted small"> · printed: {i.name}</span>}
                {choices.length > 0 && <span className="muted small item-note">{choices.join(', ')}</span>}
                {mine < i.qty && <span className="muted small item-note">{mine === 0 ? 'For someone else, not counted in What I eat' : `${mine} of ${i.qty} yours, the rest for someone else`}</span>}
                {fb?.note && <span className="muted small item-note">“{fb.note}”</span>}
              </span>
              <span className="item-price">{price(i.linePrice + g.options.reduce((s, x) => s + x.linePrice, 0), order.currency)}</span>
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
              {open === key && <ItemEditor venue={venue} raw={i.name} orderId={order.id} index={n} qty={i.qty} mine={mine} group={shown !== i.name ? shown : ''} note={fb?.note ?? ''} data={data} onDone={() => setOpen(null)} />}
            </li>
          );
        })}
      </ul>
      {split && (
        <p className="muted small">
          Items {price(split.items, order.currency)} · fees and other {price(split.fees, order.currency)}
          {split.others > 0 ? ` · paid by others ${price(split.others, order.currency)}` : ''}
          {detail.paymentMethod ? ` · ${detail.paymentMethod}` : ''}
        </p>
      )}
    </div>
  );
}

function ItemEditor({ venue, raw, orderId, index, qty, mine, group, note, data, onDone }: { venue: string; raw: string; orderId: string; index: number; qty: number; mine: number; group: string; note: string; data: Data; onDone: () => void }) {
  const [g, setG] = useState(group);
  const [n, setN] = useState(note);
  const [m, setM] = useState(mine);
  return (
    <form
      className="item-editor"
      onSubmit={async (e) => {
        e.preventDefault();
        if (n.trim() !== note.trim()) await data.rate(venue, raw, { note: n });
        if (m !== mine) await data.setMine(orderId, index, qty, m);
        if (g.trim() !== group.trim()) await data.regroup({ venue, raw }, g);
        onDone();
      }}
    >
      <label>
        <span className="muted small">How many of the {qty} were yours? (0 = all for someone else)</span>
        <input type="number" inputMode="numeric" min={0} max={qty} step={1} value={m} onChange={(e) => setM(Math.min(qty, Math.max(0, Math.floor(Number(e.target.value)) || 0)))} />
      </label>
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
