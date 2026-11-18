import { useState } from 'react';
import { EditIcon, TrashIcon } from '../../icons';
import { shortDate, today } from '../../lib/format';
import { navigate } from '../../lib/router';
import { Section } from '../clothes/charts';
import { PAYER_NAMES, UNITS, billTitle, eur, fixedPart, isOverdue, isPaid, kevinShare, usualComparison, usualText } from './bills';
import type { Payer, UtilityBill } from './types';

const PAYERS: Payer[] = ['kevin', 'felipe', 'other'];

/** One bill: the amount, whether it is paid (and a way to say it is), the consumption and the breakdown the bill printed. */
export function BillDetail({ bill: b, all, onSave, onRemove }: { bill: UtilityBill; all: UtilityBill[]; onSave: (b: UtilityBill) => Promise<void>; onRemove: () => Promise<void> }) {
  const [paying, setPaying] = useState(false);
  const [day, setDay] = useState(today());
  const [by, setBy] = useState<Payer>('kevin');
  const unit = UNITS[b.utility];
  const fixed = fixedPart(b);
  const usual = usualComparison(all, b);

  const rows: [string, string | undefined][] = [
    ['Invoice', b.number],
    ['Period', b.periodStart && b.periodEnd ? `${shortDate(b.periodStart)} – ${shortDate(b.periodEnd)}` : b.periodEnd ? `to ${shortDate(b.periodEnd)}` : undefined],
    ['Due', isPaid(b) && b.due ? shortDate(b.due) : undefined],
    ['Paid on', isPaid(b) ? shortDate(b.paidOn!) : undefined],
    ['Paid by', isPaid(b) ? (b.paidBy ? PAYER_NAMES[b.paidBy] : 'Not recorded') : undefined],
    ['Meter', b.readingEnd !== undefined ? (b.readingStart !== undefined ? `${b.readingStart} → ${b.readingEnd} ${unit}` : `${b.readingEnd} ${unit}`) : undefined],
    ['Kevin’s share', eur(kevinShare(b))],
  ];

  return (
    <>
      <Section hero title={billTitle(b)} value={eur(b.amount)} tone={b.utility === 'water' ? 1 : 3} sentence={isPaid(b) ? `Paid ${shortDate(b.paidOn!)}${b.paidBy ? ` by ${PAYER_NAMES[b.paidBy]}` : ''}.` : isOverdue(b, today()) ? `Overdue since ${shortDate(b.due!)}.` : `Not paid yet${b.due ? `, due ${shortDate(b.due)}` : ''}.`} />

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
        <Section
          title="Consumption"
          value={`${b.consumption} ${unit}`}
          tone={b.utility === 'water' ? 1 : 3}
          sentence={[usual ? `${usualText(usual)}.` : '', b.estimated ? 'The supplier estimated this reading.' : ''].filter(Boolean).join(' ') || undefined}
          note={b.consumption > 0 ? `${eur(b.amount / b.consumption)} per ${unit} all in${fixed > 0 ? `; ${eur((b.amount - fixed) / b.consumption)} without the fixed fees` : ''}.` : undefined}
        />
      )}

      <ul className="bill-facts">
        {rows.filter(([, v]) => v).map(([k, v]) => (
          <li key={k}><span className="muted">{k}</span><span>{v}</span></li>
        ))}
      </ul>

      {b.lines && b.lines.length > 0 && (
        <Section title="What it is made of">
          <ul className="bill-facts">
            {b.lines.map((l, i) => (
              <li key={i}>
                <span>{l.label}{l.quantity !== undefined && l.unitPrice !== undefined && <span className="muted small"> {l.quantity} {l.unit ?? ''} × {l.unitPrice}</span>}</span>
                <span>{eur(l.amount)}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {b.note && <p className="muted small">{b.note}</p>}

      <div className="bill-actions">
        <button type="button" className="icon-btn" aria-label="Edit the bill" onClick={() => navigate(`/home/${b.id}/edit`)}><EditIcon /></button>
        <button type="button" className="icon-btn" aria-label="Delete the bill" onClick={() => window.confirm('Delete this bill?') && void onRemove()}><TrashIcon /></button>
      </div>
    </>
  );
}
