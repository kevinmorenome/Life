import { useState } from 'react';
import { navigate } from '../../lib/router';
import { today } from '../../lib/format';
import { PAYER_NAMES, UNITS, UTILITIES, UTILITY_NAMES, round2 } from './bills';
import type { Payer, Utility, UtilityBill } from './types';

const num = (s: string): number | undefined => {
  const n = Number(s.replace(',', '.'));
  return s.trim() !== '' && Number.isFinite(n) && n >= 0 ? n : undefined;
};

/** Add or edit a bill by hand. The breakdown lines are not shown here but are kept when a bill is edited. */
export function BillForm({ bill, onSave }: { bill?: UtilityBill; onSave: (b: UtilityBill) => Promise<void> }) {
  const [utility, setUtility] = useState<Utility>(bill?.utility ?? 'water');
  const [month, setMonth] = useState(bill?.month ?? today().slice(0, 7));
  const [amount, setAmount] = useState(bill ? String(bill.amount) : '');
  const [number, setNumber] = useState(bill?.number ?? '');
  const [due, setDue] = useState(bill?.due ?? '');
  const [paidOn, setPaidOn] = useState(bill?.paidOn ?? '');
  const [paidBy, setPaidBy] = useState<Payer>(bill?.paidBy ?? 'kevin');
  const [consumption, setConsumption] = useState(bill?.consumption !== undefined ? String(bill.consumption) : '');
  const [readingStart, setReadingStart] = useState(bill?.readingStart !== undefined ? String(bill.readingStart) : '');
  const [readingEnd, setReadingEnd] = useState(bill?.readingEnd !== undefined ? String(bill.readingEnd) : '');
  const [estimated, setEstimated] = useState(!!bill?.estimated);
  const [note, setNote] = useState(bill?.note ?? '');
  const back = bill ? `/home/${bill.id}` : '/home';
  const total = num(amount);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (total === undefined || !month) return;
    const now = new Date().toISOString();
    const id = bill?.id ?? `bill-${utility}-${number.trim().replace(/[^A-Za-z0-9_-]+/g, '-') || `${month}-${crypto.randomUUID().slice(0, 8)}`}`;
    const { paidOn: _p, paidBy: _b, due: _d, ...rest } = bill ?? ({} as Partial<UtilityBill>);
    void _p; void _b; void _d;
    const next: UtilityBill = {
      ...rest,
      id,
      utility,
      month,
      amount: round2(total),
      number: number.trim() || undefined,
      ...(due ? { due } : {}),
      ...(paidOn ? { paidOn, paidBy } : {}),
      consumption: num(consumption),
      readingStart: num(readingStart),
      readingEnd: num(readingEnd),
      estimated: estimated || undefined,
      note: note.trim() || undefined,
      createdAt: bill?.createdAt ?? now,
      updatedAt: now,
    };
    await onSave(next);
    navigate(`/home/${id}`);
  }

  return (
    <form className="form" onSubmit={submit}>
      <div className="chips" role="group" aria-label="Utility">
        {UTILITIES.map((u) => (
          <button key={u} type="button" className="chip" aria-pressed={utility === u} disabled={!!bill} onClick={() => setUtility(u)}>{UTILITY_NAMES[u]}</button>
        ))}
      </div>
      <div className="field-grid">
        <label className="field"><span>Month</span><input type="month" value={month} onChange={(e) => setMonth(e.target.value)} required /></label>
        <label className="field"><span>Amount (€)</span><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required /></label>
        <label className="field"><span>Invoice number</span><input value={number} onChange={(e) => setNumber(e.target.value)} disabled={!!bill} /></label>
        <label className="field"><span>Due date</span><input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></label>
        <label className="field"><span>Paid on</span><input type="date" value={paidOn} max={today()} onChange={(e) => setPaidOn(e.target.value)} /></label>
        <label className="field"><span>Consumption ({UNITS[utility]})</span><input inputMode="decimal" value={consumption} onChange={(e) => setConsumption(e.target.value)} /></label>
        <label className="field"><span>Reading at start</span><input inputMode="decimal" value={readingStart} onChange={(e) => setReadingStart(e.target.value)} /></label>
        <label className="field"><span>Reading at end</span><input inputMode="decimal" value={readingEnd} onChange={(e) => setReadingEnd(e.target.value)} /></label>
      </div>
      {paidOn && (
        <div className="chips" role="group" aria-label="Paid by">
          {(Object.keys(PAYER_NAMES) as Payer[]).map((p) => (
            <button key={p} type="button" className="chip" aria-pressed={paidBy === p} onClick={() => setPaidBy(p)}>{PAYER_NAMES[p]}</button>
          ))}
        </div>
      )}
      <label className="review-toggle">
        <span>Reading estimated by the supplier</span>
        <input type="checkbox" role="switch" checked={estimated} onChange={(e) => setEstimated(e.target.checked)} />
      </label>
      <label className="field"><span>Notes</span><textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></label>
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={() => navigate(back)}>Cancel</button>
        <button className="btn btn-primary" disabled={total === undefined}>Save</button>
      </div>
    </form>
  );
}
