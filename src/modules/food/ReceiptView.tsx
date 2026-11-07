import { EditIcon, TrashIcon } from '../../icons';
import { money, shortDate } from '../../lib/format';
import { href, navigate } from '../../lib/router';
import { groupLines, linesTotal, receiptTotal, totalSaved } from './food';
import { KIND_LABELS, type FoodReceipt, type ReceiptLine } from './types';

const qty = (l: ReceiptLine) => (l.unit === 'pc' ? (l.quantity === 1 ? '' : `${l.quantity} × `) : `${l.quantity} ${l.unit} × `);

/** One receipt: its lines grouped by kind, with discounts and the total. */
export function ReceiptView({ receipt, onDelete }: { receipt: FoodReceipt; onDelete(id: string): Promise<void> }) {
  const saved = totalSaved(receipt.lines);
  const summed = linesTotal(receipt.lines);
  const total = receiptTotal(receipt);

  async function del() {
    if (!confirm(`Delete this ${receipt.store} receipt from ${shortDate(receipt.date)}?`)) return;
    await onDelete(receipt.id);
    navigate('/food');
  }

  return (
    <>
      <div className="game-head">
        <div>
          <h1 className="page-title">{receipt.store}</h1>
          <p className="muted small">{[shortDate(receipt.date), receipt.time, receipt.branch].filter(Boolean).join(' · ')}</p>
        </div>
        <a className="icon-btn" href={href(`/food/receipt/${receipt.id}/edit`)} aria-label="Edit receipt">
          <EditIcon />
        </a>
        <button type="button" className="icon-btn" onClick={del} aria-label="Delete receipt">
          <TrashIcon />
        </button>
      </div>
      {groupLines(receipt.lines).map((g) => (
        <section key={g.kind}>
          <h2 className="small muted">{KIND_LABELS[g.kind]}</h2>
          <ul className="game-list">
            {g.lines.map((l, i) => (
              <li key={i} className="game-line food-line">
                <span>
                  {qty(l)}
                  {l.name}
                  {l.discount > 0 && <span className="muted small"> · saved {money(l.discount)}</span>}
                </span>
                <strong>{money(l.paid)}</strong>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="food-sum">
        <span>Total</span>
        <strong>{money(total)}</strong>
      </p>
      {saved > 0 && <p className="muted small">You saved {money(saved)} on this receipt.</p>}
      {receipt.notes && <p className="muted small">{receipt.notes}</p>}
      {Math.abs(total - summed) > 0.05 && <p className="muted small">The lines add up to {money(summed)}, the receipt says {money(total)}: a line may be missing.</p>}
    </>
  );
}
