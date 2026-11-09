import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MinusIcon, PlusIcon } from '../../icons';
import { parseAmount } from './batchView';
import { formatQty } from './stock';

/** What the amount dialog asks: how much was used, frozen, taken out, or (with no `max`) how much there is now. */
export interface AmountAsk {
  title: string;
  /** One line under the title: which batch, or where it comes off. */
  hint?: string;
  /** The most that can be entered: what the batch (or the product) has. Without it any amount goes, zero included. */
  max?: number;
  /** What the field starts with; empty to make you type. */
  initial?: number;
  /** One tap of − or +. */
  step: number;
  /** Shortcuts under the field: "Half", "All", "½ left". */
  quick?: { label: string; value: number }[];
  /** Writes a quantity with its unit: "0.3 kg", "2 cans". */
  amount(q: number): string;
  /** The unit beside the field. */
  unit: string;
  confirm: string;
  /** A date to set or confirm with it: the use-by of what was taken out of the freezer. */
  date?: { label: string; value: string; min: string };
  onConfirm(quantity: number, date?: string): void;
}

/**
 * A small sheet that asks for an amount (and, when thawing, a date) instead of the browser's prompt: a field with
 * − and +, shortcuts, and what would be left. It can't go below zero or above what there is. It is drawn on the
 * body, above whatever opened it, so a blurred sheet underneath can't trap or clip it.
 */
export function AmountSheet({ ask, onClose }: { ask: AmountAsk; onClose(): void }) {
  const [text, setText] = useState(ask.initial === undefined ? '' : formatQty(ask.initial));
  const [date, setDate] = useState(ask.date?.value ?? '');
  const field = useRef<HTMLInputElement>(null);
  const counting = ask.max === undefined;
  const value = parseAmount(text, undefined, counting);
  const over = value !== undefined && ask.max !== undefined && value > ask.max + 1e-9;
  const ok = value !== undefined && !over && (!ask.date || /^\d{4}-\d{2}-\d{2}$/.test(date));

  useEffect(() => {
    // Only when there is something to type: for counted things the − and + do, and the keyboard would just be in the way.
    if (ask.initial === undefined) field.current?.focus();
    // Capture, so Escape closes this dialog and not the sheet under it.
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    document.addEventListener('keydown', esc, true);
    return () => document.removeEventListener('keydown', esc, true);
  }, [onClose]);

  const nudge = (by: number) => {
    const next = Math.max(0, Math.round(((value ?? 0) + by) * 1000) / 1000);
    setText(formatQty(ask.max === undefined ? next : Math.min(next, ask.max)));
  };

  const note = over
    ? `You only have ${ask.amount(ask.max!)}.`
    : value === undefined
      ? counting
        ? 'Type how much you have now.'
        : `Up to ${ask.amount(ask.max!)}.`
      : counting
        ? ''
        : ask.max! - value <= 1e-9
          ? 'That is all of it.'
          : `Leaves ${ask.amount(Math.round((ask.max! - value) * 1000) / 1000)}.`;

  return createPortal(
    <>
      <button type="button" className="food-scrim food-scrim-top" aria-label="Cancel" onClick={onClose} />
      <form
        className="amount-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={ask.title}
        onSubmit={(e) => {
          e.preventDefault();
          if (!ok) return;
          ask.onConfirm(value!, ask.date ? date : undefined);
          onClose();
        }}
      >
        <h2 className="amount-title">{ask.title}</h2>
        {ask.hint && <p className="muted small amount-hint">{ask.hint}</p>}
        <div className="amount-row">
          <button type="button" className="amount-step" aria-label="Decrease amount" onClick={() => nudge(-ask.step)} disabled={!value}>
            <MinusIcon />
          </button>
          <label className="amount-field">
            <input ref={field} inputMode="decimal" autoComplete="off" value={text} onChange={(e) => setText(e.target.value)} aria-label={`Amount (${ask.unit})`} aria-invalid={over} placeholder="0" />
            <span className="muted">{ask.unit}</span>
          </label>
          <button type="button" className="amount-step" aria-label="Increase amount" onClick={() => nudge(ask.step)} disabled={ask.max !== undefined && (value ?? 0) >= ask.max - 1e-9}>
            <PlusIcon />
          </button>
        </div>
        <p className={`small amount-note${over ? ' amount-note-bad' : ' muted'}`} role="status">
          {note || ' '}
        </p>
        {ask.quick && ask.quick.length > 0 && (
          <div className="chips amount-quick">
            {ask.quick.map((q) => (
              <button key={q.label} type="button" className="chip" aria-pressed={value !== undefined && Math.abs(value - q.value) < 1e-9} onClick={() => setText(formatQty(q.value))}>
                {q.label}
              </button>
            ))}
          </div>
        )}
        {ask.date && (
          <label className="amount-date">
            <span className="small muted">{ask.date.label}</span>
            <input type="date" value={date} min={ask.date.min} onChange={(e) => setDate(e.target.value)} />
          </label>
        )}
        <div className="amount-buttons">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={!ok}>
            {ask.confirm}
          </button>
        </div>
      </form>
    </>,
    document.body,
  );
}
