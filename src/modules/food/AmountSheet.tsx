import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MinusIcon, PlusIcon } from '../../icons';
import { parseAmount } from './batchView';
import { today } from '../../lib/format';
import { addDays, formatQty } from './stock';

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
  date?: { label: string; value: string; min: string; /** Follows the day above (this many days after it) until you set it yourself. */ days?: number };
  /** Which day it happened: today unless you pick another, never before `min` (when it was bought) and never after today. */
  when?: { min: string; label?: string };
  /** Only the day is asked (finishing, throwing out): there is no amount. */
  amountless?: boolean;
  onConfirm(quantity: number, date?: string, when?: string): void;
}

/**
 * A small sheet that asks for an amount (and, when thawing, a date) instead of the browser's prompt: a field with
 * − and +, shortcuts, and what would be left. It can't go below zero or above what there is. It is drawn on the
 * body, above whatever opened it, so a blurred sheet underneath can't trap or clip it.
 */
export function AmountSheet({ ask, onClose }: { ask: AmountAsk; onClose(): void }) {
  const [text, setText] = useState(ask.initial === undefined ? '' : formatQty(ask.initial));
  const [date, setDate] = useState(ask.date?.value ?? '');
  const [dateSet, setDateSet] = useState(false);
  const day = today();
  const [when, setWhen] = useState(day);
  const whenOk = !ask.when || (/^\d{4}-\d{2}-\d{2}$/.test(when) && when >= ask.when.min && when <= day);
  const field = useRef<HTMLInputElement>(null);
  const counting = ask.max === undefined;
  const value = parseAmount(text, undefined, counting);
  const over = value !== undefined && ask.max !== undefined && value > ask.max + 1e-9;
  const ok = (ask.amountless || (value !== undefined && !over)) && whenOk && (!ask.date || /^\d{4}-\d{2}-\d{2}$/.test(date));

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

  // A use-by that follows the day (a thawed batch keeps two days) moves with it until you set it yourself.
  const pickWhen = (v: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return;
    setWhen(v);
    if (ask.date?.days !== undefined && !dateSet) setDate(addDays(v, ask.date.days));
  };

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
      <button type="button" className="food-scrim food-scrim-top amount-scrim" aria-label="Cancel" onClick={onClose} />
      <form
        className="amount-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={ask.title}
        onSubmit={(e) => {
          e.preventDefault();
          if (!ok) return;
          ask.onConfirm(ask.amountless ? 0 : value!, ask.date ? date : undefined, ask.when ? when : undefined);
          onClose();
        }}
      >
        <h2 className="amount-title">{ask.title}</h2>
        {ask.hint && <p className="muted small amount-hint">{ask.hint}</p>}
        {!ask.amountless && (
        <>
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
        </>
        )}
        {ask.when && (
          <label className="amount-date">
            <span className="small muted">{ask.when.label ?? 'When'}</span>
            <input type="date" value={when} min={ask.when.min} max={day} onChange={(e) => pickWhen(e.target.value)} aria-label={ask.when.label ?? 'When'} />
          </label>
        )}
        {ask.date && (
          <label className="amount-date">
            <span className="small muted">{ask.date.label}</span>
            <input
              type="date"
              value={date}
              min={ask.date.min}
              onChange={(e) => {
                setDate(e.target.value);
                setDateSet(true);
              }}
            />
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
