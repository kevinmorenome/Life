import { useMemo, useState } from 'react';
import { CheckIcon, PlusIcon } from '../../icons';
import { shortDate, today } from '../../lib/format';
import { href } from '../../lib/router';
import { UNITS, UTILITIES, UTILITY_NAMES, eur, isOverdue, isPaid, latestBill, monthRows, paidByOther, pendingBills, usualComparison, usualText } from './bills';
import type { Utility, UtilityBill } from './types';

const monthName = (ym: string, style: 'long' | 'short' = 'long') => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString(undefined, { month: style, timeZone: 'UTC' });
const monthTitle = (b: UtilityBill) => `${UTILITY_NAMES[b.utility]} · ${monthName(b.month)} ${b.month.slice(0, 4)}`;

/**
 * Home: what needs doing now (what is still to pay), how the latest water and gas bills compare with what is usual, and the bills by
 * month. The history and trends live in Stats → Home.
 */
export function BillList({ bills }: { bills: UtilityBill[] }) {
  const now = today();
  const pending = useMemo(() => pendingBills(bills), [bills]);
  const rows = useMemo(() => monthRows(bills), [bills]);
  const years = useMemo(() => [...new Set(rows.map((r) => r.month.slice(0, 4)))], [rows]);
  const [year, setYear] = useState(years[0]);
  const other = useMemo(() => paidByOther(bills), [bills]);
  const overdue = pending.filter((b) => isOverdue(b, now)).length;
  const toPay = pending.reduce((a, b) => a + b.amount, 0);

  if (bills.length === 0) {
    return (
      <section className="card">
        <h2>No bills yet</h2>
        <p className="muted small">Send Claude a photo or PDF of a water or gas bill and the figures are added here, or add one yourself.</p>
        <a className="btn btn-primary" href={href('/home/new')}>Add a bill</a>
      </section>
    );
  }
  return (
    <>
      <section className="home-status" aria-label="To pay">
        {pending.length === 0 ? (
          <p className="home-allpaid"><CheckIcon /> <strong>All paid up</strong></p>
        ) : (
          <>
            <h2 className="stat-kicker">To pay</h2>
            <p className="home-owe">{eur(toPay)}</p>
            <p className="muted">{pending.length} {pending.length === 1 ? 'bill' : 'bills'}{overdue > 0 ? ` · ${overdue} overdue` : ''}</p>
            <ul className="bill-list">
              {pending.slice(0, 4).map((b) => (
                <li key={b.id}>
                  <a href={href(`/home/${b.id}`)}>
                    <span className="bill-name">
                      <strong>{monthTitle(b)}</strong>
                      <span className="muted small">{isOverdue(b, now) ? `Overdue since ${shortDate(b.due!)}` : b.due ? `Due ${shortDate(b.due)}` : 'Not paid yet'}</span>
                    </span>
                    <span className="bill-amount">{eur(b.amount)}</span>
                  </a>
                </li>
              ))}
            </ul>
            {pending.length > 4 && <p className="muted small">and {pending.length - 4} more in the list below.</p>}
          </>
        )}
      </section>

      <div className="home-latest">
        {UTILITIES.map((u) => (
          <Latest key={u} utility={u} bills={bills} />
        ))}
      </div>

      {other.bills > 0 && (
        <p className="small home-other">
          The other person paid {eur(other.total)} on {other.bills} bills. <a href={href('/stats/home')}>See Stats</a>
        </p>
      )}

      <div className="books-bar">
        <div className="books-chips" role="group" aria-label="Year">
          {years.map((y) => (
            <button key={y} type="button" className="chip" aria-pressed={y === year} onClick={() => setYear(y)}>{y}</button>
          ))}
        </div>
        <a className="icon-btn" href={href('/home/new')} aria-label="Add a bill"><PlusIcon /></a>
      </div>
      <ul className="bill-list">
        {rows.filter((r) => r.month.startsWith(year)).map((r) => (
          <li key={r.month} className="bill-month">
            <span className="bill-month-head">
              <strong>{monthName(r.month)}</strong>
              <span className="bill-end">
                <span className="bill-amount">{eur(r.total)}</span>
                {r.pending > 0 && <span className="bill-pill">{r.pending} to pay</span>}
              </span>
            </span>
            <span className="bill-month-links">
              {[r.water, r.gas].map((b) =>
                b ? (
                  <a key={b.id} className={`bill-chip bill-chip-${b.utility}`} href={href(`/home/${b.id}`)}>
                    {UTILITY_NAMES[b.utility]} {eur(b.amount)}{!isPaid(b) ? ' · to pay' : ''}
                  </a>
                ) : null,
              )}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

/** The newest bill of one utility: amount, usage and how that compares with what is usual. */
function Latest({ utility, bills }: { utility: Utility; bills: UtilityBill[] }) {
  const b = latestBill(bills, utility);
  if (!b) return <div />;
  const usual = usualComparison(bills, b);
  return (
    <a className={`home-tile home-tile-${utility}`} href={href(`/home/${b.id}`)}>
      <span className="stat-kicker">{UTILITY_NAMES[utility]} · {monthName(b.month, 'short')}</span>
      <span className="home-tile-amount">{eur(b.amount)}</span>
      {b.consumption !== undefined && <span className="small">{b.consumption} {UNITS[utility]}{b.estimated ? ' (est.)' : ''}</span>}
      {usual && <span className="muted small">{usualText(usual)}</span>}
    </a>
  );
}
