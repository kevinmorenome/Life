import { useState } from 'react';
import { CheckIcon, EditIcon, UndoIcon } from '../../icons';
import { notify, put } from '../../lib/db';
import { PREVIEW_LABEL } from '../../lib/preview';
import type { WoltOrder } from './types';

/** The amount to store as "my share": undefined (the whole total) for empty text; null when the text isn't a valid amount. */
export function parseShare(text: string, total: number): number | undefined | null {
  const t = text.trim().replace(',', '.');
  if (t === '') return undefined;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0 || n > total) return null;
  return Math.round(n * 100) / 100;
}

/**
 * Small editor for how much of an order you paid yourself (someone else covered the rest). Saves the order
 * with `myShare` set (or removed when emptied or equal to the total). Hidden in PR previews, which never write.
 */
export function ShareEditor({ order }: { order: WoltOrder }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState(false);
  if (PREVIEW_LABEL) return null;

  function start() {
    setText(order.myShare === undefined ? '' : String(order.myShare));
    setError(false);
    setOpen(true);
  }

  async function save(value: number | undefined) {
    const { myShare: _old, ...rest } = order;
    const next: WoltOrder = { ...rest, ...(value !== undefined && value !== order.total ? { myShare: value } : {}), updatedAt: new Date().toISOString() };
    await put('woltorders', next);
    notify('woltorders');
    setOpen(false);
  }

  if (!open) {
    return (
      <button type="button" className="icon-btn share-btn" aria-label={`Set what you paid for ${order.restaurant}`} onClick={start}>
        <EditIcon />
      </button>
    );
  }
  return (
    <form
      className="share-form"
      onSubmit={(e) => {
        e.preventDefault();
        const v = parseShare(text, order.total);
        if (v === null) setError(true);
        else void save(v);
      }}
    >
      <label className="muted small" htmlFor={`share-${order.id}`}>I paid ({order.currency}, of {order.total.toFixed(2)})</label>
      <input
        id={`share-${order.id}`}
        className="search"
        inputMode="decimal"
        autoFocus
        placeholder={order.total.toFixed(2)}
        value={text}
        aria-invalid={error}
        onChange={(e) => { setText(e.target.value); setError(false); }}
      />
      <button type="submit" className="icon-btn" aria-label="Save my share"><CheckIcon /></button>
      <button type="button" className="icon-btn" aria-label="Cancel" onClick={() => setOpen(false)}><UndoIcon /></button>
      {error && <span className="small share-error">Enter an amount from 0 to {order.total.toFixed(2)}, or leave empty for the whole order.</span>}
    </form>
  );
}
