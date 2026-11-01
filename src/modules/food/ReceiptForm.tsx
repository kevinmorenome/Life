import { useState, type FormEvent } from 'react';
import { PlusIcon, TrashIcon } from '../../icons';
import { newId } from '../../lib/db';
import { money, today } from '../../lib/format';
import { navigate } from '../../lib/router';
import { blankDraft, draftToLine, lineToDraft, linesTotal, parseNumber, type LineDraft } from './food';
import { KIND_LABELS, LINE_KINDS, UNITS, type FoodReceipt, type LineKind, type Unit } from './types';

interface Props {
  existing?: FoodReceipt;
  /** Receipts already saved, to suggest store names. */
  receipts: FoodReceipt[];
  onSave(r: FoodReceipt): Promise<void>;
}

/** Add a receipt by hand (or fix one): where and when, then one row per line. */
export function ReceiptForm({ existing, receipts, onSave }: Props) {
  const [store, setStore] = useState(existing?.store ?? '');
  const [branch, setBranch] = useState(existing?.branch ?? '');
  const [date, setDate] = useState(existing?.date ?? today());
  const [time, setTime] = useState(existing?.time ?? '');
  const [total, setTotal] = useState(existing?.total !== undefined ? String(existing.total) : '');
  const [lines, setLines] = useState<LineDraft[]>(existing ? existing.lines.map(lineToDraft) : [blankDraft()]);
  const back = existing ? `/food/receipt/${existing.id}` : '/food';

  const stores = [...new Set(receipts.map((r) => r.store))];
  const saved = lines.flatMap((d) => draftToLine(d) ?? []);
  const summed = linesTotal(saved);
  const printed = parseNumber(total);
  const update = (i: number, patch: Partial<LineDraft>) => setLines((cur) => cur.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const now = new Date().toISOString();
    const id = existing?.id ?? `food-manual-${newId()}`;
    await onSave({
      ...existing,
      id,
      store: store.trim(),
      branch: branch.trim() || undefined,
      date,
      time: time || undefined,
      total: printed,
      lines: saved,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
    navigate(`/food/receipt/${id}`);
  }

  return (
    <form className="form" onSubmit={submit}>
      <h1>{existing ? 'Edit receipt' : 'New receipt'}</h1>
      <div className="field-grid">
        <label className="field">
          <span>Store</span>
          <input required list="food-stores" value={store} onChange={(e) => setStore(e.target.value)} placeholder="Konzum" />
          <datalist id="food-stores">
            {stores.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </label>
        <label className="field">
          <span>Branch (optional)</span>
          <input value={branch} onChange={(e) => setBranch(e.target.value)} />
        </label>
        <label className="field">
          <span>Date</span>
          <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="field">
          <span>Time (optional)</span>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
      </div>

      <div className="field">
        <span>Lines</span>
        {lines.map((l, i) => (
          <div className="food-edit-line" key={i}>
            <div className="food-edit-top">
              <input value={l.name} onChange={(e) => update(i, { name: e.target.value })} placeholder="Oat milk 3.5%" aria-label={`Line ${i + 1} name`} />
              <button
                type="button"
                className="icon-btn"
                aria-label={`Remove line ${i + 1}`}
                onClick={() => setLines((cur) => (cur.length > 1 ? cur.filter((_, j) => j !== i) : [blankDraft()]))}
              >
                <TrashIcon />
              </button>
            </div>
            <div className="food-edit-nums">
              <label>
                <span className="muted small">Qty</span>
                <input inputMode="decimal" value={l.quantity} onChange={(e) => update(i, { quantity: e.target.value })} />
              </label>
              <label>
                <span className="muted small">Unit</span>
                <select value={l.unit} onChange={(e) => update(i, { unit: e.target.value as Unit })}>
                  {UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="muted small">Price each</span>
                <input inputMode="decimal" value={l.unitPrice} onChange={(e) => update(i, { unitPrice: e.target.value })} placeholder="0.00" />
              </label>
              <label>
                <span className="muted small">Discount</span>
                <input inputMode="decimal" value={l.discount} onChange={(e) => update(i, { discount: e.target.value })} placeholder="0.00" />
              </label>
            </div>
            <select className="food-kind" value={l.kind} onChange={(e) => update(i, { kind: e.target.value as LineKind })} aria-label={`Line ${i + 1} kind`}>
              {LINE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </div>
        ))}
        <button type="button" className="icon-btn" aria-label="Add a line" onClick={() => setLines((cur) => [...cur, blankDraft()])}>
          <PlusIcon />
        </button>
      </div>

      <label className="field">
        <span>Total on the receipt (optional)</span>
        <input inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} placeholder={money(summed)} />
        <span className="muted small">
          Lines add up to {money(summed)}
          {printed !== undefined && Math.abs(printed - summed) > 0.05 ? `: ${money(Math.abs(printed - summed))} ${printed > summed ? 'missing' : 'too much'}` : ''}
        </span>
      </label>

      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={() => navigate(back)}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={!store.trim() || saved.length === 0}>
          Save
        </button>
      </div>
    </form>
  );
}
