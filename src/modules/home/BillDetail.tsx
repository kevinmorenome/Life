import { useState } from 'react';
import { EditIcon, TrashIcon } from '../../icons';
import { money, shortDate, today } from '../../lib/format';
import { href } from '../../lib/router';
import { PAYER_NAMES, UNITS, billTitle, fixedPart, isPaid, kevinShare } from './bills';
import type { Payer, UtilityBill } from './types';

const PAYERS: Payer[] = ['kevin', 'felipe', 'other'];

/** One bill: the amount, whether it is paid (and a way to say it is), the consumption and the breakdown the bill printed. */
export function BillDetail({ bill: b, onSave, onRemove }: { bill: UtilityBill; onSave: (b: UtilityBill) => Promise<void>; onRemove: () => Promise<void> }) {
  const [paying, setPaying] = useState(false);
  const [day, setDay] = useState(today());
  const [by, setBy] = useState<Payer>('kevin');
  const unit = UNITS[b.utility];
  const fixed = fixedPart(b);

  const rows: [string, string | undefined][] = [
    ['Invoice', b.number],
    ['Period', b.periodStart && b.periodEnd ? `${shortDate(b.periodStart)} – ${shortDate(b.periodEnd)}` : b.periodEnd ? `to ${shortDate(b.periodEnd)}` : undefined],
    ['Due', b.due ? shortDate(b.due) : undefined],
    ['Meter', b.readingEnd !== undefined ? (b.readingStart !== undefined ? `${b.readingStart} → ${b.readingEnd} ${unit}` : `${b.readingEnd} ${unit}`) : undefined],
    ['Kevin’s share', b.paidBy === 'other' || isPaid(b) ? money(kevinShare(b)) : undefined],
  ];

  return (
    <>
      <div className="bill-head">
        <h2>{billTitle(b)}</h2>
        <p className="bill-total">{money(b.amount)}</p>
        <p className="muted">{isPaid(b) ? `Paid ${shortDate(b.paidOn!)}${b.paidBy ? ` by ${PAYER_NAMES[b.paidBy]}` : ''}` : `Pending${b.due ? ` · due ${shortDate(b.due)}` : ''}`}</p>
      </div>

      {!isPaid(b) && !paying && <button type="button" className="btn btn-primary" onClick={() => setPaying(true)}>Mark as paid</button>}
      {paying && (
        <form
          className="form"
          onSubmit={async (e) => {
            e.preventDefault();
            await onSave({ ...b, paidOn: day, paidBy: by, updatedAt: new Date().toISOString() });
            setPaying(false);
          }}
        >
          <label className="field">
            <span>Paid on</span>
            <input type="date" value={day} max={today()} onChange={(e) => setDay(e.target.value)} required />
          </label>
          <div className="chips" role="group" aria-label="Paid by">
            {PAYERS.map((p) => (
              <button key={p} type="button" className="chip" aria-pressed={by === p} onClick={() => setBy(p)}>{PAYER_NAMES[p]}</button>
            ))}
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setPaying(false)}>Cancel</button>
            <button className="btn btn-primary">Save</button>
          </div>
        </form>
      )}

      {b.consumption !== undefined && (
        <section className="card">
          <h2>Consumption</h2>
          <p className="bill-total">{b.consumption} {unit}{b.estimated && <span className="muted small"> estimated</span>}</p>
          {b.consumption > 0 && <p className="muted small">{money(b.amount / b.consumption)} per {unit} all in{fixed > 0 && b.consumption > 0 ? `; ${money((b.amount - fixed) / b.consumption)} without the fixed fees` : ''}.</p>}
        </section>
      )}

      <ul className="bill-facts">
        {rows.filter(([, v]) => v).map(([k, v]) => (
          <li key={k}><span className="muted">{k}</span><span>{v}</span></li>
        ))}
      </ul>

      {b.lines && b.lines.length > 0 && (
        <section className="card">
          <h2>What it is made of</h2>
          <ul className="bill-facts">
            {b.lines.map((l, i) => (
              <li key={i}>
                <span>{l.label}{l.quantity !== undefined && l.unitPrice !== undefined && <span className="muted small"> {l.quantity} {l.unit ?? ''} × {l.unitPrice}</span>}</span>
                <span>{money(l.amount)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {b.note && <p className="muted small">{b.note}</p>}

      <div className="bill-actions">
        <a className="icon-btn" href={href(`/home/${b.id}/edit`)} aria-label="Edit the bill"><EditIcon /></a>
        <button type="button" className="icon-btn" aria-label="Delete the bill" onClick={() => window.confirm('Delete this bill?') && void onRemove()}><TrashIcon /></button>
      </div>
    </>
  );
}
