import { PlusIcon } from '../../icons';
import { money, shortDate } from '../../lib/format';
import { href } from '../../lib/router';
import { Section } from '../clothes/charts';
import { FoodTabs } from './FoodTabs';
import { monthlySpend, receiptTotal, sortReceipts } from './food';
import { KIND_LABELS, type FoodReceipt } from './types';

const monthName = (month: string) => new Date(month + '-01T00:00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

/** Receipts newest first, with what each month cost on top. */
export function ReceiptList({ receipts }: { receipts: FoodReceipt[] }) {
  if (receipts.length === 0) {
    return (
      <>
        <FoodTabs active="receipts" />
        <div className="empty">
          <p className="muted">No receipts yet. Add one by hand, or give Claude a grocery receipt (a PDF, a photo or an e-receipt email) and ask it to add it to Life.</p>
          <a className="btn btn-primary game-new" href={href('/food/new')}>
            <PlusIcon /> New receipt
          </a>
        </div>
      </>
    );
  }
  const months = monthlySpend(receipts);
  const latest = months[0];
  const thisMonth = receipts.filter((r) => r.date.startsWith(latest.month));
  return (
    <>
      <FoodTabs active="receipts" />
      <Section
        hero
        className="page-hero"
        title={monthName(latest.month)}
        value={money(latest.total)}
        sentence={`spent on groceries in ${thisMonth.length} ${thisMonth.length === 1 ? 'trip' : 'trips'}${thisMonth.length ? `, ${money(latest.total / thisMonth.length)} a trip` : ''}. ${Object.entries(latest.byKind)
          .map(([kind, amount]) => `${KIND_LABELS[kind as keyof typeof KIND_LABELS]} ${money(amount)}`)
          .join(' · ')}`}
      />
      <ul className="game-list">
        {sortReceipts(receipts).map((r) => (
          <li key={r.id}>
            <a className="game-row" href={href(`/food/receipt/${r.id}`)}>
              <strong>
                {r.store} · {money(receiptTotal(r))}
              </strong>
              <span className="muted small">
                {[shortDate(r.date), r.time, r.branch, `${r.lines.length} ${r.lines.length === 1 ? 'line' : 'lines'}`].filter(Boolean).join(' · ')}
              </span>
            </a>
          </li>
        ))}
      </ul>
      <a className="btn btn-primary game-new" href={href('/food/new')}>
        <PlusIcon /> New receipt
      </a>
    </>
  );
}
